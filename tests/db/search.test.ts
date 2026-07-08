import { beforeEach, describe, expect, it } from "vitest";
import type { Embedder } from "../../src/lib/search/embedder";
import { embedPendingRecords } from "../../src/lib/search/pipeline";
import { searchRecords } from "../../src/lib/search/search";
import { addGroupMember, createGroup } from "../../src/lib/db/groups";
import { createPoll } from "../../src/lib/db/polls";
import { castVote } from "../../src/lib/db/votes";
import { getPool, resetDb } from "./setup";

// Needs pgvector (Supabase local / a PG with the extension). Enable with:
//   PGVECTOR_TESTS=1 DATABASE_URL=... pnpm test
const hasVectorDb = !!process.env.DATABASE_URL && !!process.env.PGVECTOR_TESTS;

/** Deterministic fake: vector = bag of char codes folded into `dim` buckets. */
class FakeEmbedder implements Embedder {
  readonly dim = 1536;
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => {
      const v = new Array<number>(this.dim).fill(0);
      for (let i = 0; i < t.length; i++) v[(t.charCodeAt(i) * 31 + i) % this.dim]! += 1;
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      return v.map((x) => x / norm);
    });
  }
}

describe.runIf(hasVectorDb)("embedding pipeline + semantic search", () => {
  beforeEach(async () => {
    await resetDb();
    await getPool().query("truncate record_embeddings");
  });

  async function sealOne(memberName: string, title: string, opinion: string) {
    const m = await getPool().query(
      "insert into members (name, email) values ($1, $2) returning id",
      [memberName, `${memberName}-${Math.random().toString(36).slice(2, 8)}@example.com`]
    );
    const memberId = m.rows[0].id;
    const { id: groupId } = await createGroup(getPool(), { name: `${title} group`, created_by: memberId });
    const poll = await createPoll(getPool(), {
      group_id: groupId,
      created_by: memberId,
      title,
      quorum_percent: 100,
      option_labels: ["Yes", "No"],
    });
    await castVote(getPool(), {
      poll_id: poll.id,
      member_id: memberId,
      option_id: poll.options[0]!.id,
      opinion,
    });
    return { memberId, groupId };
  }

  it("embeds pending records and finds them by meaning-ish similarity", async () => {
    const embedder = new FakeEmbedder();
    const { memberId } = await sealOne("Yogi", "Split the rent by room size", "bigger room bigger share");
    await sealOne("Solo", "Pick the trip destination", "mountains beat beaches");

    const embedded = await embedPendingRecords(getPool(), embedder);
    expect(embedded).toBe(2);
    // Second pass: nothing left to embed.
    expect(await embedPendingRecords(getPool(), embedder)).toBe(0);

    // Yogi only searches Yogi's groups — the other group's record must not leak.
    const hits = await searchRecords(getPool(), embedder, memberId, "Split the rent by room size");
    expect(hits.length).toBe(1);
    expect(hits[0]!.title).toBe("Split the rent by room size");
  });
});
