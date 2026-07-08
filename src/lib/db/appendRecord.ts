import type { Pool } from "pg";
import { computeRecordHash, genesisHash, HASH_VERSION } from "../chain/hash";
import type { RecordFields, StoredRecord } from "../chain/types";

export type NewRecordInput = Omit<RecordFields, "seq" | "prev_hash" | "hash_version">;

/**
 * Atomically appends a record to a group's chain.
 * The per-group advisory lock serializes concurrent finalizations;
 * UNIQUE(group_id, seq) is the backstop if the lock is ever bypassed.
 */
export async function appendRecord(pool: Pool, input: NewRecordInput): Promise<StoredRecord> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [input.group_id]);

    const head = await client.query(
      "select seq, this_hash from records where group_id = $1 order by seq desc limit 1",
      [input.group_id]
    );
    const seq: number = head.rows.length ? head.rows[0].seq + 1 : 1;
    const prev_hash: string = head.rows.length ? head.rows[0].this_hash : await genesisHash(input.group_id);

    // Deterministic array order before hashing — array order is significant in canonical JSON.
    const fields: RecordFields = {
      ...input,
      options: [...input.options].sort((a, b) => a.id.localeCompare(b.id)),
      participants: [...input.participants].sort((a, b) => a.member_id.localeCompare(b.member_id)),
      votes: [...input.votes].sort((a, b) => a.participant_id.localeCompare(b.participant_id)),
      seq,
      prev_hash,
      hash_version: HASH_VERSION,
    };
    const this_hash = await computeRecordHash(fields);

    await client.query(
      `insert into records
        (group_id, poll_id, seq, title, context, options_snapshot, participants_snapshot, votes_snapshot,
         winning_option_id, quorum_percent, prev_hash, this_hash, hash_version, finalized_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        fields.group_id,
        fields.poll_id,
        fields.seq,
        fields.title,
        fields.context,
        JSON.stringify(fields.options),
        JSON.stringify(fields.participants),
        JSON.stringify(fields.votes),
        fields.winning_option_id,
        fields.quorum_percent,
        fields.prev_hash,
        this_hash,
        fields.hash_version,
        fields.finalized_at,
      ]
    );
    await client.query("commit");
    return { ...fields, this_hash };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
