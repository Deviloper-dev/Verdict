import type { Pool } from "pg";
import type { StoredRecord } from "../chain/types";

/**
 * Loads a group's chain in the exact string shapes that were hashed at seal
 * time (timestamps re-serialized with the same to_char format), so
 * verifyChain over the result recomputes byte-identical canonical JSON.
 */
export async function loadChain(pool: Pool, groupId: string): Promise<StoredRecord[]> {
  const { rows } = await pool.query(
    `select seq, group_id, poll_id, title, context,
            options_snapshot as options, participants_snapshot as participants, votes_snapshot as votes,
            winning_option_id, quorum_percent,
            to_char(finalized_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as finalized_at,
            prev_hash, hash_version, this_hash
       from records where group_id = $1 order by seq`,
    [groupId]
  );
  return rows as StoredRecord[];
}
