import type { Pool } from "pg";

export interface GroupSummary {
  id: string;
  name: string;
  member_count: number;
  open_polls: number;
  record_count: number;
}

export async function listGroupsForMember(pool: Pool, memberId: string): Promise<GroupSummary[]> {
  const { rows } = await pool.query(
    `select g.id, g.name,
            (select count(*)::int from group_members where group_id = g.id) as member_count,
            (select count(*)::int from polls p where p.group_id = g.id and p.status = 'open') as open_polls,
            (select count(*)::int from records r where r.group_id = g.id) as record_count
       from groups g
       join group_members gm on gm.group_id = g.id and gm.member_id = $1
      order by g.created_at`,
    [memberId]
  );
  return rows;
}

export async function isGroupMember(pool: Pool, groupId: string, memberId: string): Promise<boolean> {
  const r = await pool.query("select 1 from group_members where group_id = $1 and member_id = $2", [
    groupId,
    memberId,
  ]);
  return r.rows.length > 0;
}

export interface PollSummary {
  id: string;
  title: string;
  status: "open" | "withdrawn" | "finalized";
  quorum_percent: number;
  participant_count: number;
  vote_count: number;
  i_am_participant: boolean;
  i_have_voted: boolean;
  record_seq: number | null;
  created_at: string;
}

export interface GroupDetail {
  id: string;
  name: string;
  members: { member_id: string; name: string; email: string }[];
  polls: PollSummary[];
  record_count: number;
}

export async function getGroupDetail(
  pool: Pool,
  groupId: string,
  memberId: string
): Promise<GroupDetail | null> {
  if (!(await isGroupMember(pool, groupId, memberId))) return null;
  const g = await pool.query("select id, name from groups where id = $1", [groupId]);
  if (g.rows.length === 0) return null;

  const members = await pool.query(
    `select gm.member_id, m.name, m.email
       from group_members gm join members m on m.id = gm.member_id
      where gm.group_id = $1 order by m.name`,
    [groupId]
  );
  const polls = await pool.query(
    `select p.id, p.title, p.status, p.quorum_percent, p.created_at::text,
            (select count(*)::int from participants where poll_id = p.id) as participant_count,
            (select count(*)::int from votes where poll_id = p.id) as vote_count,
            exists(select 1 from participants pp where pp.poll_id = p.id and pp.member_id = $2) as i_am_participant,
            exists(select 1 from votes v join participants pp on pp.id = v.participant_id
                    where v.poll_id = p.id and pp.member_id = $2) as i_have_voted,
            (select seq from records r where r.poll_id = p.id) as record_seq
       from polls p
      where p.group_id = $1 and p.status <> 'withdrawn'
      order by (p.status = 'open') desc, p.created_at desc`,
    [groupId, memberId]
  );
  const recs = await pool.query("select count(*)::int as n from records where group_id = $1", [groupId]);
  return {
    id: g.rows[0].id,
    name: g.rows[0].name,
    members: members.rows,
    polls: polls.rows,
    record_count: recs.rows[0].n,
  };
}

export interface PollView {
  id: string;
  group_id: string;
  group_name: string;
  created_by: string;
  creator_name: string;
  title: string;
  context: string;
  quorum_percent: number;
  status: "open" | "withdrawn" | "finalized";
  options: { id: string; label: string }[];
  participants: { member_id: string; name: string; has_voted: boolean }[];
  my_vote: { option_id: string; opinion: string } | null;
  i_am_participant: boolean;
  record_seq: number | null;
}

export async function getPollView(pool: Pool, pollId: string, memberId: string): Promise<PollView | null> {
  const p = await pool.query(
    `select p.id, p.group_id, g.name as group_name, p.created_by, m.name as creator_name,
            p.title, p.context, p.quorum_percent, p.status
       from polls p join groups g on g.id = p.group_id join members m on m.id = p.created_by
      where p.id = $1`,
    [pollId]
  );
  if (p.rows.length === 0) return null;
  const poll = p.rows[0];
  if (!(await isGroupMember(pool, poll.group_id, memberId))) return null;

  const options = await pool.query("select id, label from options where poll_id = $1 order by id", [pollId]);
  const participants = await pool.query(
    `select pp.member_id, m.name,
            exists(select 1 from votes v where v.participant_id = pp.id) as has_voted
       from participants pp join members m on m.id = pp.member_id
      where pp.poll_id = $1 order by m.name`,
    [pollId]
  );
  const mine = await pool.query(
    `select v.option_id, v.opinion_text as opinion
       from votes v join participants pp on pp.id = v.participant_id
      where v.poll_id = $1 and pp.member_id = $2`,
    [pollId, memberId]
  );
  const rec = await pool.query("select seq from records where poll_id = $1", [pollId]);

  return {
    ...poll,
    options: options.rows,
    participants: participants.rows,
    my_vote: mine.rows[0] ?? null,
    i_am_participant: participants.rows.some((r) => r.member_id === memberId),
    record_seq: rec.rows[0]?.seq ?? null,
  };
}

export interface RecordSummary {
  seq: number;
  poll_id: string;
  title: string;
  winning_label: string;
  finalized_at: string;
  prev_hash: string;
  this_hash: string;
  vote_count: number;
}

export async function listRecordsForGroup(
  pool: Pool,
  groupId: string,
  memberId: string
): Promise<RecordSummary[] | null> {
  if (!(await isGroupMember(pool, groupId, memberId))) return null;
  const { rows } = await pool.query(
    `select seq, poll_id, title, winning_option_id, options_snapshot, votes_snapshot,
            to_char(finalized_at at time zone 'UTC', 'DD Mon YYYY, HH24:MI UTC') as finalized_at,
            prev_hash, this_hash
       from records where group_id = $1 order by seq desc`,
    [groupId]
  );
  return rows.map((r) => ({
    seq: r.seq,
    poll_id: r.poll_id,
    title: r.title,
    winning_label:
      (r.options_snapshot as { id: string; label: string }[]).find((o) => o.id === r.winning_option_id)
        ?.label ?? "—",
    finalized_at: r.finalized_at,
    prev_hash: r.prev_hash,
    this_hash: r.this_hash,
    vote_count: (r.votes_snapshot as unknown[]).length,
  }));
}

export interface RecordView {
  seq: number;
  title: string;
  context: string;
  quorum_percent: number;
  winning_label: string;
  finalized_at: string;
  prev_hash: string;
  this_hash: string;
  options: { id: string; label: string; votes: number }[];
  participants: { member_id: string; name: string }[];
  votes: { name: string; option_label: string; opinion: string; voted_at: string }[];
}

export async function getRecordBySeq(
  pool: Pool,
  groupId: string,
  seq: number,
  memberId: string
): Promise<RecordView | null> {
  if (!(await isGroupMember(pool, groupId, memberId))) return null;
  const { rows } = await pool.query(
    `select seq, title, context, quorum_percent, winning_option_id,
            options_snapshot, participants_snapshot, votes_snapshot,
            to_char(finalized_at at time zone 'UTC', 'DD Mon YYYY, HH24:MI UTC') as finalized_at,
            prev_hash, this_hash
       from records where group_id = $1 and seq = $2`,
    [groupId, seq]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  const options = r.options_snapshot as { id: string; label: string }[];
  const participants = r.participants_snapshot as { member_id: string; name: string }[];
  const votes = r.votes_snapshot as {
    participant_id: string;
    option_id: string;
    opinion: string;
    voted_at: string;
  }[];
  const nameOf = new Map(participants.map((p) => [p.member_id, p.name]));
  const labelOf = new Map(options.map((o) => [o.id, o.label]));
  return {
    seq: r.seq,
    title: r.title,
    context: r.context,
    quorum_percent: r.quorum_percent,
    winning_label: labelOf.get(r.winning_option_id) ?? "—",
    finalized_at: r.finalized_at,
    prev_hash: r.prev_hash,
    this_hash: r.this_hash,
    options: options.map((o) => ({
      ...o,
      votes: votes.filter((v) => v.option_id === o.id).length,
    })),
    participants,
    votes: votes.map((v) => ({
      name: nameOf.get(v.participant_id) ?? v.participant_id,
      option_label: labelOf.get(v.option_id) ?? "—",
      opinion: v.opinion,
      voted_at: v.voted_at,
    })),
  };
}
