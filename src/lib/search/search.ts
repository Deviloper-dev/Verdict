import type { Pool } from "pg";
import type { Embedder } from "./embedder";

export interface SearchHit {
  group_id: string;
  group_name: string;
  seq: number;
  title: string;
  winning_label: string;
  finalized_at: string;
  similarity: number;
}

/** Semantic search over sealed records, scoped to the member's groups. */
export async function searchRecords(
  pool: Pool,
  embedder: Embedder,
  memberId: string,
  query: string,
  opts: { groupId?: string; limit?: number } = {}
): Promise<SearchHit[]> {
  const [queryVector] = await embedder.embed([query]);
  const params: unknown[] = [JSON.stringify(queryVector), memberId];
  let groupFilter = "";
  if (opts.groupId) {
    params.push(opts.groupId);
    groupFilter = `and r.group_id = $${params.length}`;
  }
  params.push(opts.limit ?? 10);

  const { rows } = await pool.query(
    `select r.group_id, g.name as group_name, r.seq, r.title,
            r.winning_option_id, r.options_snapshot,
            to_char(r.finalized_at at time zone 'UTC', 'DD Mon YYYY') as finalized_at,
            1 - (e.embedding <=> $1::vector) as similarity
       from record_embeddings e
       join records r on r.id = e.record_id
       join groups g on g.id = r.group_id
       join group_members gm on gm.group_id = r.group_id and gm.member_id = $2
      where true ${groupFilter}
      order by e.embedding <=> $1::vector
      limit $${params.length}`,
    params
  );
  return rows.map((r) => ({
    group_id: r.group_id,
    group_name: r.group_name,
    seq: r.seq,
    title: r.title,
    winning_label:
      (r.options_snapshot as { id: string; label: string }[]).find((o) => o.id === r.winning_option_id)
        ?.label ?? "—",
    finalized_at: r.finalized_at,
    similarity: Number(r.similarity),
  }));
}
