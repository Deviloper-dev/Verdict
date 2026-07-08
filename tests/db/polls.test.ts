import { beforeEach, describe, expect, it } from "vitest";
import { createGroup, addGroupMember } from "../../src/lib/db/groups";
import { addParticipant, createPoll, removeParticipant, withdrawPoll } from "../../src/lib/db/polls";
import { getPool, resetDb } from "./setup";

const hasDb = !!process.env.DATABASE_URL;

async function makeMember(name: string): Promise<string> {
  const r = await getPool().query("insert into members (name, email) values ($1, $2) returning id", [
    name,
    `${name.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
  ]);
  return r.rows[0].id;
}

async function seed() {
  const yogi = await makeMember("Yogi");
  const asha = await makeMember("Asha");
  const ravi = await makeMember("Ravi");
  const outsider = await makeMember("Outsider");
  const { id: groupId } = await createGroup(getPool(), { name: "G", created_by: yogi });
  await addGroupMember(getPool(), { group_id: groupId, member_id: asha });
  await addGroupMember(getPool(), { group_id: groupId, member_id: ravi });
  return { yogi, asha, ravi, outsider, groupId };
}

describe.runIf(hasDb)("createPoll", () => {
  beforeEach(resetDb);

  it("defaults participants to all group members", async () => {
    const { yogi, groupId } = await seed();
    const poll = await createPoll(getPool(), {
      group_id: groupId,
      created_by: yogi,
      title: "T",
      quorum_percent: 60,
      option_labels: ["A", "B"],
    });
    expect(poll.participants).toHaveLength(3);
    expect(poll.options.map((o) => o.label)).toEqual(["A", "B"]);
  });

  it("allows narrowing participants to a subset", async () => {
    const { yogi, asha, groupId } = await seed();
    const poll = await createPoll(getPool(), {
      group_id: groupId,
      created_by: yogi,
      title: "T",
      quorum_percent: 100,
      option_labels: ["A", "B"],
      participant_member_ids: [yogi, asha],
    });
    expect(poll.participants.map((p) => p.member_id).sort()).toEqual([yogi, asha].sort());
  });

  it("rejects fewer than 2 options", async () => {
    const { yogi, groupId } = await seed();
    await expect(
      createPoll(getPool(), {
        group_id: groupId,
        created_by: yogi,
        title: "T",
        quorum_percent: 60,
        option_labels: ["only one"],
      })
    ).rejects.toThrow(/at least 2 options/);
  });

  it("rejects participants who are not group members", async () => {
    const { yogi, outsider, groupId } = await seed();
    await expect(
      createPoll(getPool(), {
        group_id: groupId,
        created_by: yogi,
        title: "T",
        quorum_percent: 60,
        option_labels: ["A", "B"],
        participant_member_ids: [yogi, outsider],
      })
    ).rejects.toThrow(/does not belong/);
  });

  it("rejects a creator who is not a group member", async () => {
    const { outsider, groupId } = await seed();
    await expect(
      createPoll(getPool(), {
        group_id: groupId,
        created_by: outsider,
        title: "T",
        quorum_percent: 60,
        option_labels: ["A", "B"],
      })
    ).rejects.toThrow(/does not belong/);
  });
});

describe.runIf(hasDb)("participant rules", () => {
  beforeEach(resetDb);

  async function pollWithVote() {
    const s = await seed();
    const poll = await createPoll(getPool(), {
      group_id: s.groupId,
      created_by: s.yogi,
      title: "T",
      quorum_percent: 100,
      option_labels: ["A", "B"],
      participant_member_ids: [s.yogi, s.asha],
    });
    // Cast one vote directly (votes service lands in Task 4).
    const part = poll.participants.find((p) => p.member_id === s.yogi)!;
    await getPool().query(
      "insert into votes (poll_id, option_id, participant_id, opinion_text) values ($1, $2, $3, 'because')",
      [poll.id, poll.options[0]!.id, part.id]
    );
    return { ...s, poll };
  }

  it("allows adds after votes exist (only raises denominator)", async () => {
    const { ravi, yogi, poll } = await pollWithVote();
    await addParticipant(getPool(), { poll_id: poll.id, member_id: ravi, actor_id: yogi });
    const r = await getPool().query("select count(*)::int as n from participants where poll_id = $1", [
      poll.id,
    ]);
    expect(r.rows[0].n).toBe(3);
  });

  it("blocks removal after the first vote", async () => {
    const { asha, yogi, poll } = await pollWithVote();
    await expect(
      removeParticipant(getPool(), { poll_id: poll.id, member_id: asha, actor_id: yogi })
    ).rejects.toThrow(/cannot be removed after the first vote/);
  });

  it("allows removal before any votes", async () => {
    const s = await seed();
    const poll = await createPoll(getPool(), {
      group_id: s.groupId,
      created_by: s.yogi,
      title: "T",
      quorum_percent: 60,
      option_labels: ["A", "B"],
    });
    await removeParticipant(getPool(), { poll_id: poll.id, member_id: s.ravi, actor_id: s.yogi });
    const r = await getPool().query("select count(*)::int as n from participants where poll_id = $1", [
      poll.id,
    ]);
    expect(r.rows[0].n).toBe(2);
  });

  it("only the creator can edit participants or withdraw", async () => {
    const { asha, ravi, poll } = await pollWithVote();
    await expect(
      addParticipant(getPool(), { poll_id: poll.id, member_id: ravi, actor_id: asha })
    ).rejects.toThrow(/only the poll creator/);
    await expect(withdrawPoll(getPool(), { poll_id: poll.id, actor_id: asha })).rejects.toThrow(
      /only the poll creator/
    );
  });

  it("creator can withdraw an open poll; withdrawn polls refuse edits", async () => {
    const { yogi, ravi, poll } = await pollWithVote();
    await withdrawPoll(getPool(), { poll_id: poll.id, actor_id: yogi });
    const r = await getPool().query("select status from polls where id = $1", [poll.id]);
    expect(r.rows[0].status).toBe("withdrawn");
    await expect(
      addParticipant(getPool(), { poll_id: poll.id, member_id: ravi, actor_id: yogi })
    ).rejects.toThrow(/not open/);
  });
});
