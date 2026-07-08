import type { Pool } from "pg";
import type { StoredRecord } from "../chain/types";
import { loadChain } from "../db/chain";

export interface GroupExport {
  group_id: string;
  group_name: string;
  head_seq: number;
  head_hash: string;
  records: StoredRecord[];
}

export interface AnchorExport {
  generated_at: string;
  groups: GroupExport[];
}

/**
 * Full export of every group's chain: the anchor job commits this publicly,
 * making it simultaneously the tamper-evidence anchor AND the backup.
 * Restore = reinsert records rows; the chain re-verifies from the raw data.
 */
export async function buildExport(pool: Pool): Promise<AnchorExport> {
  const groups = await pool.query(
    "select distinct g.id, g.name from groups g join records r on r.group_id = g.id order by g.name"
  );
  const out: GroupExport[] = [];
  for (const g of groups.rows) {
    const records = await loadChain(pool, g.id);
    const head = records[records.length - 1]!;
    out.push({
      group_id: g.id,
      group_name: g.name,
      head_seq: head.seq,
      head_hash: head.this_hash,
      records,
    });
  }
  return { generated_at: new Date().toISOString(), groups: out };
}
