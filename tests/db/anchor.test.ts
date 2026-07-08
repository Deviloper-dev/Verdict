import { beforeEach, describe, expect, it } from "vitest";
import { buildExport } from "../../src/lib/anchor/export";
import { verifyChain } from "../../src/lib/chain/verify";
import { addGroupMember, createGroup } from "../../src/lib/db/groups";
import { createPoll } from "../../src/lib/db/polls";
import { castVote } from "../../src/lib/db/votes";
import { getPool, loadStoredChain, resetDb } from "./setup";

const hasDb = !!process.env.DATABASE_URL;

async function makeMember(name: string): Promise<string> {
  const r = await getPool().query("insert into members (name, email) values ($1, $2) returning id", [
    name,
    `${name.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
  ]);
  return r.rows[0].id;
}

async function sealTwoRecords(): Promise<{ groupId: string }> {
  const yogi = await makeMember("Yogi");
  const asha = await makeMember("Asha");
  const { id: groupId } = await createGroup(getPool(), { name: "Anchor Group", created_by: yogi });
  await addGroupMember(getPool(), { group_id: groupId, member_id: asha });
  for (const title of ["First debate", "Second debate"]) {
    const poll = await createPoll(getPool(), {
      group_id: groupId,
      created_by: yogi,
      title,
      quorum_percent: 100,
      option_labels: ["A", "B"],
    });
    await castVote(getPool(), { poll_id: poll.id, member_id: yogi, option_id: poll.options[0]!.id, opinion: "a" });
    await castVote(getPool(), { poll_id: poll.id, member_id: asha, option_id: poll.options[0]!.id, opinion: "b" });
  }
  return { groupId };
}

describe.runIf(hasDb)("anchor export & restore", () => {
  beforeEach(resetDb);

  it("export heads match the chain tails and records verify", async () => {
    const { groupId } = await sealTwoRecords();
    const exp = await buildExport(getPool());
    const grp = exp.groups.find((g) => g.group_id === groupId)!;
    expect(grp.head_seq).toBe(2);
    expect(grp.records).toHaveLength(2);
    expect(grp.head_hash).toBe(grp.records[1]!.this_hash);
    expect((await verifyChain(groupId, grp.records)).valid).toBe(true);
  });

  it("restore-from-export: wiped records reload and re-verify (M4 exit criteria)", async () => {
    const { groupId } = await sealTwoRecords();
    const exp = await buildExport(getPool());
    const grp = exp.groups.find((g) => g.group_id === groupId)!;

    // Disaster: the records table is wiped (TRUNCATE bypasses row triggers).
    // CASCADE covers record_embeddings' FK when migration 00004 is applied.
    await getPool().query("truncate records cascade");
    expect(await loadStoredChain(groupId)).toHaveLength(0);

    // Restore straight from the public export.
    for (const r of grp.records) {
      await getPool().query(
        `insert into records
          (group_id, poll_id, seq, title, context, options_snapshot, participants_snapshot, votes_snapshot,
           winning_option_id, quorum_percent, prev_hash, this_hash, hash_version, finalized_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          r.group_id,
          r.poll_id,
          r.seq,
          r.title,
          r.context,
          JSON.stringify(r.options),
          JSON.stringify(r.participants),
          JSON.stringify(r.votes),
          r.winning_option_id,
          r.quorum_percent,
          r.prev_hash,
          r.this_hash,
          r.hash_version,
          r.finalized_at,
        ]
      );
    }
    const restored = await loadStoredChain(groupId);
    expect(restored).toHaveLength(2);
    const verdict = await verifyChain(groupId, restored, {
      seq: grp.head_seq,
      this_hash: grp.head_hash,
    });
    expect(verdict.failures).toEqual([]);
    expect(verdict.valid).toBe(true);
  });
});
