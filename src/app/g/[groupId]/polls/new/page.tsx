import Link from "next/link";
import { notFound } from "next/navigation";
import { createPollAction } from "../../../../actions";
import { requireMember } from "../../../../../lib/auth/server";
import { getPool } from "../../../../../lib/db/pool";
import { getGroupDetail } from "../../../../../lib/db/queries";

export default async function NewPollPage({
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

  const createPollFor = createPollAction.bind(null, group.id);

  return (
    <main>
      <div className="topbar">
        <span className="wordmark">
          <Link href="/">Verdict</Link>
        </span>
        <nav>
          <Link href={`/g/${group.id}`}>{group.name}</Link>
        </nav>
      </div>

      <h1>Open a case</h1>
      <p className="muted small">
        When enough participants have voted and one option leads outright, the case seals itself into the
        permanent ledger. No edits after that — for anyone.
      </p>

      <form action={createPollFor}>
        <label htmlFor="title">What&rsquo;s the debate?</label>
        <input id="title" name="title" type="text" required placeholder="How do we split the trip costs?" />

        <label htmlFor="context">Context (optional)</label>
        <textarea id="context" name="context" placeholder="Background, links, the story so far…" />

        <label htmlFor="options">Options — one per line, at least two</label>
        <textarea id="options" name="options" required placeholder={"Split evenly\nSplit by consumption"} />

        <label htmlFor="quorum_percent">Quorum — % of participants who must vote before sealing</label>
        <select id="quorum_percent" name="quorum_percent" defaultValue="75">
          <option value="50">50% — half is enough</option>
          <option value="60">60%</option>
          <option value="75">75%</option>
          <option value="100">100% — everyone must vote</option>
        </select>

        <label>Participants</label>
        <p className="small muted" style={{ margin: "0 0 0.4rem" }}>
          Everyone is in by default. You can add people later, but you can only remove them before the first
          vote lands.
        </p>
        {group.members.map((m) => (
          <div key={m.member_id} style={{ margin: "0.2rem 0" }}>
            <label style={{ display: "inline", margin: 0, color: "var(--text)" }}>
              <input type="checkbox" name="participants" value={m.member_id} defaultChecked /> {m.name}
            </label>
          </div>
        ))}

        <button type="submit">Open the case</button>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}
