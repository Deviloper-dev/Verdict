import type { PoolClient } from "pg";
import type { StoredRecord } from "../chain/types";
import { appendRecordTx } from "./appendRecord";

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

/**
 * Checks quorum + strict-plurality winner and seals the poll if both hold.
 * MUST be called inside an open transaction that already holds the
 * per-group advisory lock (castVote does this). Returns the sealed record,
 * or null if the poll stays open (quorum not met, or tied).
 */
export async function checkAndFinalize(client: PoolClient, pollId: string): Promise<StoredRecord | null> {
  const pollRes = await client.query(
    "select group_id, title, context, quorum_percent, status from polls where id = $1 for update",
    [pollId]
  );
  if (pollRes.rows.length === 0) throw new Error("poll not found");
  const poll = pollRes.rows[0];
  if (poll.status !== "open") return null;

  const counts = await client.query(
    `select
       (select count(*)::int from participants where poll_id = $1) as participants,
       (select count(*)::int from votes where poll_id = $1) as votes`,
    [pollId]
  );
  const { participants, votes } = counts.rows[0] as { participants: number; votes: number };

  // Integer math: votes/participants >= quorum% without float drift.
  if (votes * 100 < poll.quorum_percent * participants) return null;

  const tally = await client.query(
    "select option_id, count(*)::int as n from votes where poll_id = $1 group by option_id order by n desc",
    [pollId]
  );
  const top = tally.rows[0];
  const second = tally.rows[1];
  if (!top || (second && second.n === top.n)) return null; // tie — poll stays open

  const optionsSnap = await client.query(
    "select id, label from options where poll_id = $1 order by id",
    [pollId]
  );
  const participantsSnap = await client.query(
    `select p.member_id, m.name,
            to_char(p.added_at at time zone 'UTC', ${ISO}) as added_at
       from participants p join members m on m.id = p.member_id
      where p.poll_id = $1 order by p.member_id`,
    [pollId]
  );
  const votesSnap = await client.query(
    `select p.member_id as participant_id, v.option_id, v.opinion_text as opinion,
            to_char(v.created_at at time zone 'UTC', ${ISO}) as voted_at
       from votes v join participants p on p.id = v.participant_id
      where v.poll_id = $1 order by p.member_id`,
    [pollId]
  );

  const record = await appendRecordTx(client, {
    group_id: poll.group_id,
    poll_id: pollId,
    title: poll.title,
    context: poll.context,
    options: optionsSnap.rows,
    participants: participantsSnap.rows,
    votes: votesSnap.rows,
    winning_option_id: top.option_id,
    quorum_percent: poll.quorum_percent,
    finalized_at: new Date().toISOString(),
  });

  await client.query("update polls set status = 'finalized' where id = $1", [pollId]);
  return record;
}
