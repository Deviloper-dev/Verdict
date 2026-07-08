import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addParticipantAction,
  castVoteAction,
  removeParticipantAction,
  withdrawPollAction,
} from "../../../../actions";
import { requireMember } from "../../../../../lib/auth/server";
import { getPool } from "../../../../../lib/db/pool";
import { getGroupDetail, getPollView } from "../../../../../lib/db/queries";

export default async function PollPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string; pollId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await requireMember();
  const { groupId, pollId } = await params;
  const { error } = await searchParams;
  const poll = await getPollView(getPool(), pollId, me.id);
  if (!poll || poll.group_id !== groupId) notFound();

  const votedCount = poll.participants.filter((p) => p.has_voted).length;
  const iAmCreator = poll.created_by === me.id;
  const vote = castVoteAction.bind(null, groupId, pollId);
  const addPart = addParticipantAction.bind(null, groupId, pollId);
  const removePart = removeParticipantAction.bind(null, groupId, pollId);
  const withdraw = withdrawPollAction.bind(null, groupId, pollId);

  const group = iAmCreator ? await getGroupDetail(getPool(), groupId, me.id) : null;
  const nonParticipants =
    group?.members.filter((m) => !poll.participants.some((p) => p.member_id === m.member_id)) ?? [];
  const anyVotes = votedCount > 0;

  return (
    <main>
      <div className="topbar">
        <span className="wordmark">
          <Link href="/">Verdict</Link>
        </span>
        <nav>
          <Link href={`/g/${groupId}`}>{poll.group_name}</Link>
        </nav>
      </div>

      <h1>{poll.title}</h1>
      {poll.context && <p className="muted">{poll.context}</p>}
      <p className="small">
        {poll.status === "open" && <span className="chip open">OPEN</span>}
        {poll.status === "finalized" && <span className="chip sealed">SEALED № {poll.record_seq}</span>}
        {poll.status === "withdrawn" && <span className="chip withdrawn">WITHDRAWN</span>}{" "}
        <span className="muted">
          opened by {poll.creator_name} · quorum {poll.quorum_percent}% · {votedCount} of{" "}
          {poll.participants.length} voted
        </span>
      </p>

      {poll.status === "finalized" && (
        <p>
          <Link className="btn" href={`/g/${groupId}/records/${poll.record_seq}`}>
            Read the sealed verdict
          </Link>
        </p>
      )}

      {poll.status === "open" && poll.i_am_participant && (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <h3>{poll.my_vote ? "Your vote (you can change it until sealing)" : "Record your vote"}</h3>
          <form action={vote}>
            {poll.options.map((o) => (
              <div className="option-row" key={o.id}>
                <input
                  type="radio"
                  id={`opt-${o.id}`}
                  name="option_id"
                  value={o.id}
                  defaultChecked={poll.my_vote?.option_id === o.id}
                  required
                />
                <label htmlFor={`opt-${o.id}`} style={{ margin: 0, color: "var(--text)" }}>
                  {o.label}
                </label>
              </div>
            ))}
            <label htmlFor="opinion">Your reasoning — required, it goes on the permanent record</label>
            <textarea
              id="opinion"
              name="opinion"
              required
              defaultValue={poll.my_vote?.opinion ?? ""}
              placeholder="Why this option? Your future selves are reading."
            />
            <button type="submit">{poll.my_vote ? "Change vote" : "Cast vote"}</button>
          </form>
          <p className="small muted" style={{ marginTop: "0.75rem" }}>
            Votes and reasoning stay hidden while the case is open. Everything is revealed in the sealed
            verdict.
          </p>
        </div>
      )}

      {poll.status === "open" && !poll.i_am_participant && (
        <p className="muted">You&rsquo;re watching this one — only selected participants can vote.</p>
      )}

      <div className="card" style={{ marginTop: "1rem" }}>
        <h3>Participants</h3>
        <table>
          <tbody>
            {poll.participants.map((p) => (
              <tr key={p.member_id}>
                <td>{p.name}</td>
                <td className="small" style={{ color: p.has_voted ? "var(--green)" : "var(--orange)" }}>
                  {p.has_voted ? "voted" : "awaiting vote"}
                </td>
                {iAmCreator && poll.status === "open" && !anyVotes && (
                  <td style={{ textAlign: "right" }}>
                    <form action={removePart} style={{ display: "inline" }}>
                      <input type="hidden" name="member_id" value={p.member_id} />
                      <button className="quiet" style={{ margin: 0, padding: "0.15rem 0.5rem" }}>
                        remove
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {iAmCreator && poll.status === "open" && nonParticipants.length > 0 && (
          <form action={addPart}>
            <label htmlFor="member_id">Add a participant (raises the quorum bar — allowed any time)</label>
            <select id="member_id" name="member_id">
              {nonParticipants.map((m) => (
                <option key={m.member_id} value={m.member_id}>
                  {m.name}
                </option>
              ))}
            </select>
            <button type="submit" className="quiet">
              Add participant
            </button>
          </form>
        )}
        {iAmCreator && poll.status === "open" && anyVotes && (
          <p className="small muted">Removal is locked — the first vote has been cast.</p>
        )}
      </div>

      {iAmCreator && poll.status === "open" && (
        <form action={withdraw}>
          <button className="danger">Withdraw this case</button>
        </form>
      )}

      {error && <p className="error">{error}</p>}
    </main>
  );
}
