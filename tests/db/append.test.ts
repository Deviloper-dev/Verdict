import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { verifyChain } from "../../src/lib/chain/verify";
import type { StoredRecord } from "../../src/lib/chain/types";
import { appendRecord, type NewRecordInput } from "../../src/lib/db/appendRecord";
import { getPool, resetDb, seedGroup } from "./setup";

const hasDb = !!process.env.DATABASE_URL;

function makeInput(groupId: string, pollId: string, title: string): NewRecordInput {
  return {
    group_id: groupId,
    poll_id: pollId,
    title,
    context: "ctx",
    options: [
      { id: "o1", label: "Yes" },
      { id: "o2", label: "No" },
    ],
    participants: [{ member_id: "m1", name: "A", added_at: "2026-07-08T00:00:00Z" }],
    votes: [{ participant_id: "pt1", option_id: "o1", opinion: "because", voted_at: "2026-07-08T01:00:00Z" }],
    winning_option_id: "11111111-1111-1111-1111-111111111111",
    quorum_percent: 60,
    finalized_at: "2026-07-08T02:00:00.000Z",
  };
}

async function loadChain(groupId: string): Promise<StoredRecord[]> {
  const { rows } = await getPool().query(
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

afterAll(async () => {
  if (hasDb) await getPool().end();
});

describe.runIf(hasDb)("schema", () => {
  beforeEach(resetDb);

  it("enforces UNIQUE(group_id, seq) on records", async () => {
    const { groupId, pollId } = await seedGroup();
    const insert = `insert into records
      (group_id, poll_id, seq, title, options_snapshot, participants_snapshot, votes_snapshot,
       winning_option_id, quorum_percent, prev_hash, this_hash, hash_version, finalized_at)
      values ($1, $2, 1, 't', '[]', '[]', '[]', gen_random_uuid(), 60, 'p', $3, 1, now())`;
    await getPool().query(insert, [groupId, pollId, "hash-a"]);
    await expect(getPool().query(insert, [groupId, pollId, "hash-b"])).rejects.toThrow(
      /duplicate key|unique/i
    );
  });

  it("rejects votes with blank opinions", async () => {
    const { pollId, memberId } = await seedGroup();
    const opt = await getPool().query("insert into options (poll_id, label) values ($1, 'A') returning id", [
      pollId,
    ]);
    const part = await getPool().query(
      "insert into participants (poll_id, member_id) values ($1, $2) returning id",
      [pollId, memberId]
    );
    await expect(
      getPool().query(
        "insert into votes (poll_id, option_id, participant_id, opinion_text) values ($1, $2, $3, '   ')",
        [pollId, opt.rows[0].id, part.rows[0].id]
      )
    ).rejects.toThrow(/check/i);
  });
});

describe.runIf(hasDb)("append-only enforcement", () => {
  beforeEach(resetDb);

  async function insertOne(): Promise<{ groupId: string }> {
    const { groupId, pollId } = await seedGroup();
    await getPool().query(
      `insert into records
        (group_id, poll_id, seq, title, options_snapshot, participants_snapshot, votes_snapshot,
         winning_option_id, quorum_percent, prev_hash, this_hash, hash_version, finalized_at)
        values ($1, $2, 1, 't', '[]', '[]', '[]', gen_random_uuid(), 60, 'p', 'h1', 1, now())`,
      [groupId, pollId]
    );
    return { groupId };
  }

  it("blocks UPDATE on records", async () => {
    await insertOne();
    await expect(getPool().query("update records set title = 'tampered'")).rejects.toThrow(/immutable/);
  });

  it("blocks DELETE on records", async () => {
    await insertOne();
    await expect(getPool().query("delete from records")).rejects.toThrow(/immutable/);
  });
});

describe.runIf(hasDb)("appendRecord", () => {
  beforeEach(resetDb);

  it("appends sequential records that verify as a valid chain", async () => {
    const { groupId, pollId } = await seedGroup();
    for (let i = 1; i <= 3; i++) {
      await appendRecord(getPool(), makeInput(groupId, pollId, `Decision ${i}`));
    }
    const chain = await loadChain(groupId);
    expect(chain.map((r) => r.seq)).toEqual([1, 2, 3]);
    const result = await verifyChain(groupId, chain);
    expect(result.failures).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("assigns unique gap-free seqs under concurrent appends", async () => {
    const { groupId, pollId } = await seedGroup();
    await Promise.all(
      Array.from({ length: 5 }, (_, i) => appendRecord(getPool(), makeInput(groupId, pollId, `C${i}`)))
    );
    const chain = await loadChain(groupId);
    expect(chain.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5]);
    expect((await verifyChain(groupId, chain)).valid).toBe(true);
  });
});

describe.runIf(hasDb)("M0 exit criteria: tamper detection end-to-end", () => {
  beforeEach(resetDb);

  async function seedChain(n: number): Promise<{ groupId: string; sealed: StoredRecord[] }> {
    const { groupId, pollId } = await seedGroup();
    const sealed: StoredRecord[] = [];
    for (let i = 1; i <= n; i++) {
      sealed.push(await appendRecord(getPool(), makeInput(groupId, pollId, `Decision ${i}`)));
    }
    return { groupId, sealed };
  }

  async function asMaliciousOwner(sql: string, params: unknown[] = []): Promise<void> {
    // A malicious DB owner can disable the trigger — the chain must still expose them.
    await getPool().query("alter table records disable trigger records_immutable");
    await getPool().query(sql, params);
    await getPool().query("alter table records enable trigger records_immutable");
  }

  it("detects a directly tampered row", async () => {
    const { groupId } = await seedChain(4);
    await asMaliciousOwner(
      `update records set votes_snapshot = '[{"participant_id":"pt1","option_id":"o2","opinion":"changed my mind","voted_at":"2026-07-08T01:00:00Z"}]'
        where group_id = $1 and seq = 2`,
      [groupId]
    );
    const result = await verifyChain(groupId, await loadChain(groupId));
    expect(result.valid).toBe(false);
    expect(result.failures).toContainEqual({ kind: "hash_mismatch", seq: 2 });
  });

  it("detects a deleted row as a seq gap", async () => {
    const { groupId } = await seedChain(4);
    await asMaliciousOwner("delete from records where group_id = $1 and seq = 2", [groupId]);
    const result = await verifyChain(groupId, await loadChain(groupId));
    expect(result.valid).toBe(false);
    expect(result.failures).toContainEqual({ kind: "seq_gap", expected: 2, found: 3 });
  });

  it("detects a truncated tail via the anchor", async () => {
    const { groupId, sealed } = await seedChain(4);
    const anchor = { seq: 4, this_hash: sealed[3]!.this_hash };
    await asMaliciousOwner("delete from records where group_id = $1 and seq in (3, 4)", [groupId]);
    const result = await verifyChain(groupId, await loadChain(groupId), anchor);
    expect(result.valid).toBe(false);
    expect(result.failures).toContainEqual({ kind: "truncated", anchorSeq: 4, headSeq: 2 });
  });
});
