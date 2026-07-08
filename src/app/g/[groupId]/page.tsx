import Link from "next/link";
import { notFound } from "next/navigation";
import { addMemberByEmailAction } from "../../actions";
import { requireMember } from "../../../lib/auth/server";
import { getPool } from "../../../lib/db/pool";
import { getGroupDetail } from "../../../lib/db/queries";

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await requireMember();
  const { groupId } = await params;
  const { error } = await searchParams;
  const group = await getGroupDetail(getPool(), groupId, me.id);
  if (!group) notFound();

  const addMember = addMemberByEmailAction.bind(null, group.id);

  return (
    <main>
      <div className="topbar">
        <span className="wordmark">
          <Link href="/">Verdict</Link>
        </span>
        <nav>
          <Link href={`/g/${group.id}/records`}>Ledger ({group.record_count})</Link> ·{" "}
          <Link href={`/g/${group.id}/verify`}>Verify chain</Link>
        </nav>
      </div>

      <h1>{group.name}</h1>
      <p className="small muted">
        {group.members.map((m) => m.name).join(" · ")}
      </p>

      <p style={{ margin: "1.5rem 0" }}>
        <Link className="btn" href={`/g/${group.id}/polls/new`}>
          Open a new case
        </Link>
      </p>

      {group.polls.length === 0 && (
        <p className="muted">Nothing under debate. Open a case when the next argument starts.</p>
      )}
      {group.polls.map((p) => (
        <div className="card" key={p.id}>
          <h3>
            <Link href={`/g/${group.id}/p/${p.id}`}>{p.title}</Link>
          </h3>
          <p className="small" style={{ margin: "0.3rem 0 0" }}>
            {p.status === "open" && (
              <>
                <span className="chip open">OPEN</span>{" "}
                <span className="muted">
                  {p.vote_count} of {p.participant_count} voted · quorum {p.quorum_percent}%
                  {p.i_am_participant && !p.i_have_voted && (
                    <strong style={{ color: "var(--orange)" }}> · your vote is needed</strong>
                  )}
                </span>
              </>
            )}
            {p.status === "finalized" && (
              <>
                <span className="chip sealed">SEALED № {p.record_seq}</span>{" "}
                <Link className="small" href={`/g/${group.id}/records/${p.record_seq}`}>
                  read the verdict
                </Link>
              </>
            )}
          </p>
        </div>
      ))}

      <div className="card" style={{ marginTop: "2rem" }}>
        <h3>Add a member</h3>
        <p className="small muted">They need to have signed in to Verdict once before you can add them.</p>
        <form action={addMember}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required placeholder="friend@example.com" />
          <button type="submit">Add to {group.name}</button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    </main>
  );
}
