import { beforeEach, describe, expect, it } from "vitest";
import { verifyChain } from "../../src/lib/chain/verify";
import { addGroupMember, createGroup } from "../../src/lib/db/groups";
import { addParticipant, createPoll, withdrawPoll } from "../../src/lib/db/polls";
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

async function seed(quorum: number, participantCount: 2 | 3 = 3) {
  const yogi = await makeMember("Yogi");
  const asha = await makeMember("Asha");
  const ravi = await makeMember("Ravi");
  const { id: groupId } = await createGroup(getPool(), { name: "G", created_by: yogi });
  await addGroupMember(getPool(), { group_id: groupId, member_id: asha });
  await addGroupMember(getPool(), { group_id: groupId, member_id: ravi });
  const participant_member_ids = participantCount === 2 ? [yogi, asha] : [yogi, asha, ravi];
  const poll = await createPoll(getPool(), {
    group_id: groupId,
    created_by: yogi,
    title: "Where to eat?",
    context: "weekend plan",
    quorum_percent: quorum,
    option_labels: ["Pizza", "Biryani"],
    participant_member_ids,
  });
  const [optA, optB] = poll.options;
  return { yogi, asha, ravi, groupId, poll, optA: optA!, optB: optB! };
}

describe.runIf(hasDb)("castVote validation", () => {
  beforeEach(resetDb);

  it("rejects non-participants", async () => {
    const { ravi, poll, optA } = await seed(100, 2);
    await expect(
      castVote(getPool(), { poll_id: poll.id, member_id: ravi, option_id: optA.id, opinion: "x" })
    ).rejects.toThrow(/only selected participants/);
  });

  it("rejects blank opinions", async () => {
    const { yogi, poll, optA } = await seed(100, 2);
    await expect(
      castVote(getPool(), { poll_id: poll.id, member_id: yogi, option_id: optA.id, opinion: "   " })
    ).rejects.toThrow(/opinion is mandatory/);
  });

  it("rejects options from another poll", async () => {
    const { yogi, groupId, poll } = await seed(100, 2);
    const other = await createPoll(getPool(), {
      group_id: groupId,
      created_by: yogi,
      title: "Other",
      quorum_percent: 100,
      option_labels: ["X", "Y"],
      participant_member_ids: [yogi],
    });
    await expect(
      castVote(getPool(), {
        poll_id: poll.id,
        member_id: yogi,
        option_id: other.options[0]!.id,
        opinion: "x",
      })
    ).rejects.toThrow(/does not belong/);
  });

  it("rejects votes on withdrawn polls", async () => {
    const { yogi, poll, optA } = await seed(100, 2);
    await withdrawPoll(getPool(), { poll_id: poll.id, actor_id: yogi });
    await expect(
      castVote(getPool(), { poll_id: poll.id, member_id: yogi, option_id: optA.id, opinion: "x" })
    ).rejects.toThrow(/not open/);
  });
});

describe.runIf(hasDb)("finalization", () => {
  beforeEach(resetDb);

  it("stays open below quorum", async () => {
    const { yogi, poll, optA } = await seed(100, 3);
    const r = await castVote(getPool(), {
      poll_id: poll.id,
      member_id: yogi,
      option_id: optA.id,
      opinion: "pizza is life",
    });
    expect(r.finalized).toBe(false);
  });

  it("finalizes at quorum with a strict winner and the chain verifies", async () => {
    const { yogi, asha, groupId, poll, optA } = await seed(60, 3);
    await castVote(getPool(), { poll_id: poll.id, member_id: yogi, option_id: optA.id, opinion: "cheap" });
    const r = await castVote(getPool(), {
      poll_id: poll.id,
      member_id: asha,
      option_id: optA.id,
      opinion: "agreed",
    });
    expect(r.finalized).toBe(true);
    expect(r.record!.winning_option_id).toBe(optA.id);
    expect(r.record!.votes).toHaveLength(2);
    expect(r.record!.participants).toHaveLength(3);

    const chain = await loadStoredChain(groupId);
    const verdict = await verifyChain(groupId, chain);
    expect(verdict.failures).toEqual([]);
    expect(verdict.valid).toBe(true);

    const status = await getPool().query("select status from polls where id = $1", [poll.id]);
    expect(status.rows[0].status).toBe("finalized");
  });

  it("a tie at quorum stays open, and a changed vote breaks it", async () => {
    const { yogi, asha, poll, optA, optB } = await seed(100, 2);
    await castVote(getPool(), { poll_id: poll.id, member_id: yogi, option_id: optA.id, opinion: "A!" });
    const tied = await castVote(getPool(), {
      poll_id: poll.id,
      member_id: asha,
      option_id: optB.id,
      opinion: "B!",
    });
    expect(tied.finalized).toBe(false); // 1–1 at 100% quorum: tie holds it open

    const broken = await castVote(getPool(), {
      poll_id: poll.id,
      member_id: asha,
      option_id: optA.id,
      opinion: "fine, A — your biryani argument was bad",
    });
    expect(broken.finalized).toBe(true);
    expect(broken.record!.winning_option_id).toBe(optA.id);
    // The sealed record keeps ONE vote per participant — the final one.
    expect(broken.record!.votes).toHaveLength(2);
    expect(broken.record!.votes.every((v) => v.option_id === optA.id)).toBe(true);
  });

  it("rejects votes after finalization", async () => {
    const { yogi, asha, ravi, poll, optA } = await seed(60, 3);
    await castVote(getPool(), { poll_id: poll.id, member_id: yogi, option_id: optA.id, opinion: "a" });
    await castVote(getPool(), { poll_id: poll.id, member_id: asha, option_id: optA.id, opinion: "b" });
    await expect(
      castVote(getPool(), { poll_id: poll.id, member_id: ravi, option_id: optA.id, opinion: "late" })
    ).rejects.toThrow(/not open/);
  });

  it("adding a participant mid-vote raises the quorum denominator", async () => {
    const { yogi, asha, ravi, poll, optA, optB } = await seed(100, 2);
    await castVote(getPool(), { poll_id: poll.id, member_id: yogi, option_id: optA.id, opinion: "a" });
    await addParticipant(getPool(), { poll_id: poll.id, member_id: ravi, actor_id: yogi });
    const second = await castVote(getPool(), {
      poll_id: poll.id,
      member_id: asha,
      option_id: optA.id,
      opinion: "b",
    });
    expect(second.finalized).toBe(false); // 2/3 voted, quorum is 100%
    const third = await castVote(getPool(), {
      poll_id: poll.id,
      member_id: ravi,
      option_id: optB.id,
      opinion: "c",
    });
    expect(third.finalized).toBe(true); // 3/3, A wins 2–1
    expect(third.record!.winning_option_id).toBe(optA.id);
    expect(third.record!.participants).toHaveLength(3);
  });
});
