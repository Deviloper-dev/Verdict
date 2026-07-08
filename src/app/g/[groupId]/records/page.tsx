import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "../../../../lib/auth/server";
import { getPool } from "../../../../lib/db/pool";
import { listRecordsForGroup } from "../../../../lib/db/queries";

export default async function LedgerPage({ params }: { params: Promise<{ groupId: string }> }) {
  const me = await requireMember();
  const { groupId } = await params;
  const records = await listRecordsForGroup(getPool(), groupId, me.id);
  if (records === null) notFound();

  return (
    <main>
      <div className="topbar">
        <span className="wordmark">
          <Link href="/">Verdict</Link>
        </span>
        <nav>
          <Link href={`/g/${groupId}`}>back to group</Link> ·{" "}
          <Link href={`/g/${groupId}/verify`}>Verify chain</Link>
        </nav>
      </div>

      <h1>The ledger</h1>
      <p className="muted small">
        Every sealed verdict, newest first. Each one carries the hash of the one before it — that&rsquo;s
        the chain.
      </p>

      {records.length === 0 && <p className="muted">Nothing sealed yet.</p>}

      <div className="chain">
        {records.map((r) => (
          <div className="card" key={r.seq}>
            <h3>
              <span className="mono muted">№ {String(r.seq).padStart(3, "0")}</span>{" "}
              <Link href={`/g/${groupId}/records/${r.seq}`}>{r.title}</Link>
            </h3>
            <p className="small" style={{ margin: "0.25rem 0 0" }}>
              <span style={{ color: "var(--green)" }}>{r.winning_label}</span>
              <span className="muted">
                {" "}
                · {r.vote_count} opinions on record · {r.finalized_at}
              </span>
            </p>
            <p className="hashline">
              seal <span className="h">{r.this_hash.slice(0, 16)}…</span> ← prev{" "}
              {r.prev_hash.slice(0, 16)}…
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
