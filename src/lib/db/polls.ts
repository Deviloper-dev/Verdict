import type { Pool, PoolClient } from "pg";

export interface PollDetail {
  id: string;
  group_id: string;
  created_by: string;
  title: string;
  context: string;
  quorum_percent: number;
  status: "open" | "withdrawn" | "finalized";
  options: { id: string; label: string }[];
  participants: { id: string; member_id: string }[];
}

export interface CreatePollInput {
  group_id: string;
  created_by: string;
  title: string;
  context?: string;
  quorum_percent: number;
  option_labels: string[];
  /** Defaults to all current group members. */
  participant_member_ids?: string[];
}

async function assertGroupMember(client: PoolClient, groupId: string, memberId: string): Promise<void> {
  const r = await client.query("select 1 from group_members where group_id = $1 and member_id = $2", [
    groupId,
    memberId,
  ]);
  if (r.rows.length === 0) throw new Error("member does not belong to this group");
}

export async function createPoll(pool: Pool, input: CreatePollInput): Promise<PollDetail> {
  if (input.option_labels.length < 2) throw new Error("a poll needs at least 2 options");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await assertGroupMember(client, input.group_id, input.created_by);

    let participantIds = input.participant_member_ids;
    if (!participantIds || participantIds.length === 0) {
      const all = await client.query("select member_id from group_members where group_id = $1", [
        input.group_id,
      ]);
      participantIds = all.rows.map((r) => r.member_id);
    } else {
      for (const memberId of participantIds) {
        await assertGroupMember(client, input.group_id, memberId);
      }
    }

    const poll = await client.query(
      `insert into polls (group_id, created_by, title, context, quorum_percent)
       values ($1, $2, $3, $4, $5) returning id, status`,
      [input.group_id, input.created_by, input.title, input.context ?? "", input.quorum_percent]
    );
    const pollId: string = poll.rows[0].id;

    const options: { id: string; label: string }[] = [];
    for (const label of input.option_labels) {
      const o = await client.query("insert into options (poll_id, label) values ($1, $2) returning id", [
        pollId,
        label,
      ]);
      options.push({ id: o.rows[0].id, label });
    }

    const participants: { id: string; member_id: string }[] = [];
    for (const memberId of participantIds) {
      const p = await client.query(
        "insert into participants (poll_id, member_id) values ($1, $2) returning id",
        [pollId, memberId]
      );
      participants.push({ id: p.rows[0].id, member_id: memberId });
    }

    await client.query("commit");
    return {
      id: pollId,
      group_id: input.group_id,
      created_by: input.created_by,
      title: input.title,
      context: input.context ?? "",
      quorum_percent: input.quorum_percent,
      status: "open",
      options,
      participants,
    };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

async function loadOpenPollForCreatorAction(
  client: PoolClient,
  pollId: string,
  actorId: string
): Promise<{ group_id: string }> {
  const r = await client.query("select group_id, created_by, status from polls where id = $1 for update", [
    pollId,
  ]);
  if (r.rows.length === 0) throw new Error("poll not found");
  if (r.rows[0].created_by !== actorId) throw new Error("only the poll creator can do this");
  if (r.rows[0].status !== "open") throw new Error("poll is not open");
  return { group_id: r.rows[0].group_id };
}

/** Adds are allowed until finalization — they only raise the quorum denominator. */
export async function addParticipant(
  pool: Pool,
  input: { poll_id: string; member_id: string; actor_id: string }
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { group_id } = await loadOpenPollForCreatorAction(client, input.poll_id, input.actor_id);
    await assertGroupMember(client, group_id, input.member_id);
    await client.query("insert into participants (poll_id, member_id) values ($1, $2)", [
      input.poll_id,
      input.member_id,
    ]);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/** Removals only before the first vote — shrinking the denominator later could game quorum. */
export async function removeParticipant(
  pool: Pool,
  input: { poll_id: string; member_id: string; actor_id: string }
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await loadOpenPollForCreatorAction(client, input.poll_id, input.actor_id);
    const votes = await client.query("select 1 from votes where poll_id = $1 limit 1", [input.poll_id]);
    if (votes.rows.length > 0) {
      throw new Error("participants cannot be removed after the first vote is cast");
    }
    const del = await client.query("delete from participants where poll_id = $1 and member_id = $2", [
      input.poll_id,
      input.member_id,
    ]);
    if (del.rowCount === 0) throw new Error("not a participant of this poll");
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function withdrawPoll(pool: Pool, input: { poll_id: string; actor_id: string }): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await loadOpenPollForCreatorAction(client, input.poll_id, input.actor_id);
    await client.query("update polls set status = 'withdrawn' where id = $1", [input.poll_id]);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
