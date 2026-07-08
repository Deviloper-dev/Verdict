import Link from "next/link";
import { requireMember } from "../../lib/auth/server";
import { getPool } from "../../lib/db/pool";
import { listGroupsForMember } from "../../lib/db/queries";
import { OpenAIEmbedder } from "../../lib/search/embedder";
import { searchRecords, type SearchHit } from "../../lib/search/search";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; group?: string }>;
}) {
  const me = await requireMember();
  const { q, group } = await searchParams;
  const groups = await listGroupsForMember(getPool(), me.id);

  let hits: SearchHit[] | null = null;
  let error: string | null = null;
  if (q && q.trim()) {
    try {
      hits = await searchRecords(getPool(), new OpenAIEmbedder(), me.id, q.trim(), {
        groupId: group || undefined,
      });
    } catch (err) {
      error = err instanceof Error ? err.message : "search failed";
    }
  }

  return (
    <main>
      <div className="topbar">
        <span className="wordmark">
          <Link href="/">Verdict</Link>
        </span>
        <nav>
          <Link href="/">your groups</Link>
        </nav>
      </div>

      <h1>What did we decide about…</h1>
      <form method="get">
        <label htmlFor="q">Search by meaning, not keywords</label>
        <input id="q" name="q" type="text" defaultValue={q ?? ""} placeholder="splitting the rent" />
        <label htmlFor="group">Group</label>
        <select id="group" name="group" defaultValue={group ?? ""}>
          <option value="">All my groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <button type="submit">Search the ledger</button>
      </form>

      {error && <p className="error">{error}</p>}

      {hits && hits.length === 0 && (
        <p className="muted" style={{ marginTop: "1.5rem" }}>
          Nothing in the ledger matches. Either it was never settled — or it&rsquo;s time to open a case.
        </p>
      )}
      {hits && hits.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          {hits.map((h) => (
            <div className="card" key={`${h.group_id}-${h.seq}`}>
              <h3>
                <span className="mono muted">№ {String(h.seq).padStart(3, "0")}</span>{" "}
                <Link href={`/g/${h.group_id}/records/${h.seq}`}>{h.title}</Link>
              </h3>
              <p className="small" style={{ margin: "0.25rem 0 0" }}>
                <span style={{ color: "var(--green)" }}>{h.winning_label}</span>
                <span className="muted">
                  {" "}
                  · {h.group_name} · {h.finalized_at} · {(h.similarity * 100).toFixed(0)}% match
                </span>
              </p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
