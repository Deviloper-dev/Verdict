import type { Pool } from "pg";
import type { StoredRecord } from "../chain/types";
import { checkAndFinalize } from "./finalize";

export interface CastVoteInput {
  poll_id: string;
  member_id: string;
  option_id: string;
  opinion: string;
}

export interface CastVoteResult {
  finalized: boolean;
  record?: StoredRecord;
}

/**
 * Casts (or changes) a vote and finalizes the poll in the same transaction
 * if quorum + a strict-plurality winner are reached. The per-group advisory
 * lock makes the quorum check and sealing atomic against concurrent votes.
 */
export async function castVote(pool: Pool, input: CastVoteInput): Promise<CastVoteResult> {
  if (input.opinion.trim().length === 0) {
    throw new Error("an opinion is mandatory — a bare option selection is not accepted");
  }
  const client = await pool.connect();
  try {
    await client.query("begin");

    const pollRes = await client.query("select group_id, status from polls where id = $1", [input.poll_id]);
    if (pollRes.rows.length === 0) throw new Error("poll not found");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [pollRes.rows[0].group_id]);

    // Re-read status under the lock — a concurrent vote may have finalized it.
    const fresh = await client.query("select status from polls where id = $1 for update", [input.poll_id]);
    if (fresh.rows[0].status !== "open") throw new Error("poll is not open");

    const part = await client.query(
      "select id from participants where poll_id = $1 and member_id = $2",
      [input.poll_id, input.member_id]
    );
    if (part.rows.length === 0) throw new Error("only selected participants can vote on this poll");

    const opt = await client.query("select 1 from options where id = $1 and poll_id = $2", [
      input.option_id,
      input.poll_id,
    ]);
    if (opt.rows.length === 0) throw new Error("option does not belong to this poll");

    await client.query(
      `insert into votes (poll_id, option_id, participant_id, opinion_text)
       values ($1, $2, $3, $4)
       on conflict (participant_id)
       do update set option_id = excluded.option_id, opinion_text = excluded.opinion_text, created_at = now()`,
      [input.poll_id, input.option_id, part.rows[0].id, input.opinion]
    );

    const record = await checkAndFinalize(client, input.poll_id);
    await client.query("commit");
    return record ? { finalized: true, record } : { finalized: false };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
