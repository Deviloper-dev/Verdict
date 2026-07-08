import { beforeEach, describe, expect, it } from "vitest";
import { addGroupMember, createGroup } from "../../src/lib/db/groups";
import { createPoll } from "../../src/lib/db/polls";
import { castVote } from "../../src/lib/db/votes";
import { getPool, resetDb } from "./setup";

const hasDb = !!process.env.DATABASE_URL;

async function makeMember(name: string): Promise<string> {
  const r = await getPool().query("insert into members (name, email) values ($1, $2) returning id", [
    name,
    `${name.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
  ]);
  return r.rows[0].id;
}

/** Runs queries as the `authenticated` role with auth.uid() = memberId. */
async function asUser<T>(memberId: string, sql: string, params: unknown[] = []): Promise<T[]> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [memberId]);
    await client.query("set local role authenticated");
    const { rows } = await client.query(sql, params);
    await client.query("commit");
    return rows as T[];
  } finally {
    client.release();
  }
}

describe.runIf(hasDb)("RLS group scoping", () => {
  beforeEach(resetDb);

  async function seedTwoGroups() {
    const yogi = await makeMember("Yogi");
    const asha = await makeMember("Asha");
    const g1 = (await createGroup(getPool(), { name: "Group One", created_by: yogi })).id;
    const g2 = (await createGroup(getPool(), { name: "Group Two", created_by: asha })).id;

    for (const [gid, creator] of [
      [g1, yogi],
      [g2, asha],
    ] as const) {
      const poll = await createPoll(getPool(), {
        group_id: gid,
        created_by: creator,
        title: `Poll of ${gid.slice(0, 4)}`,
        quorum_percent: 100,
        option_labels: ["A", "B"],
      });
      await castVote(getPool(), {
        poll_id: poll.id,
        member_id: creator,
        option_id: poll.options[0]!.id,
        opinion: "sealing this",
      });
    }
    return { yogi, asha, g1, g2 };
  }

  it("members see only their own group's groups/polls/records", async () => {
    const { yogi, g1 } = await seedTwoGroups();
    const groups = await asUser<{ id: string }>(yogi, "select id from groups");
    expect(groups.map((g) => g.id)).toEqual([g1]);

    const polls = await asUser<{ group_id: string }>(yogi, "select group_id from polls");
    expect(polls.every((p) => p.group_id === g1)).toBe(true);
    expect(polls).toHaveLength(1);

    const records = await asUser<{ group_id: string }>(yogi, "select group_id from records");
    expect(records).toHaveLength(1);
    expect(records[0]!.group_id).toBe(g1);
  });

  it("members cannot see votes or opinions from other groups", async () => {
    const { asha, g2 } = await seedTwoGroups();
    const votes = await asUser<{ poll_id: string }>(asha, "select poll_id from votes");
    expect(votes).toHaveLength(1);
    const polls = await asUser<{ id: string; group_id: string }>(asha, "select id, group_id from polls");
    expect(polls[0]!.group_id).toBe(g2);
  });

  it("a member of no groups sees nothing", async () => {
    await seedTwoGroups();
    const loner = await makeMember("Loner");
    expect(await asUser(loner, "select id from groups")).toEqual([]);
    expect(await asUser(loner, "select id from records")).toEqual([]);
    expect(await asUser(loner, "select id from members where id <> $1", [loner])).toEqual([]);
  });

  it("authenticated role cannot write to records directly", async () => {
    const { yogi, g1 } = await seedTwoGroups();
    await expect(
      asUser(
        yogi,
        `insert into records (group_id, poll_id, seq, title, options_snapshot, participants_snapshot,
          votes_snapshot, winning_option_id, quorum_percent, prev_hash, this_hash, hash_version, finalized_at)
          select $1, p.id, 99, 'forged', '[]', '[]', '[]', gen_random_uuid(), 60, 'x', 'forged-hash', 1, now()
          from polls p where p.group_id = $1 limit 1`,
        [g1]
      )
    ).rejects.toThrow(/permission denied|violates row-level security/i);
  });
});
