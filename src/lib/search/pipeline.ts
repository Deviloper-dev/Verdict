import type { Pool } from "pg";
import type { Embedder } from "./embedder";
import { buildRecordText } from "./recordText";

/**
 * Embeds sealed records that don't have embeddings yet (new seals AND any
 * missed earlier because the embedding API was down — this IS the retry).
 * Never throws on embedding failure: finalization latency and correctness
 * must be independent of the embedding provider (PRD §6.4).
 */
export async function embedPendingRecords(pool: Pool, embedder: Embedder, limit = 20): Promise<number> {
  const pending = await pool.query(
    `select r.id, r.title, r.context, r.winning_option_id,
            r.options_snapshot, r.participants_snapshot, r.votes_snapshot
       from records r
       left join record_embeddings e on e.record_id = r.id
      where e.record_id is null
      order by r.finalized_at
      limit $1`,
    [limit]
  );
  if (pending.rows.length === 0) return 0;

  try {
    const texts = pending.rows.map((r) =>
      buildRecordText({
        title: r.title,
        context: r.context,
        winning_option_id: r.winning_option_id,
        options_snapshot: r.options_snapshot,
        participants_snapshot: r.participants_snapshot,
        votes_snapshot: r.votes_snapshot,
      })
    );
    const vectors = await embedder.embed(texts);
    for (let i = 0; i < pending.rows.length; i++) {
      await pool.query(
        `insert into record_embeddings (record_id, content, embedding)
         values ($1, $2, $3::vector) on conflict (record_id) do nothing`,
        [pending.rows[i].id, texts[i], JSON.stringify(vectors[i])]
      );
    }
    return pending.rows.length;
  } catch (err) {
    console.error("embedding pass failed (will retry on next pass):", err);
    return 0;
  }
}
