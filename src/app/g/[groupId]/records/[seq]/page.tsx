import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "../../../../../lib/auth/server";
import { getPool } from "../../../../../lib/db/pool";
import { getRecordBySeq } from "../../../../../lib/db/queries";

export default async function RecordPage({
  params,
}: {
  params: Promise<{ groupId: string; seq: string }>;
}) {
  const me = await requireMember();
  const { groupId, seq } = await params;
  const record = await getRecordBySeq(getPool(), groupId, Number(seq), me.id);
  if (!record) notFound();

  return (
    <main>
      <div className="topbar">
        <span className="wordmark">
          <Link href="/">Verdict</Link>
        </span>
        <nav>
          <Link href={`/g/${groupId}/records`}>the ledger</Link>
        </nav>
      </div>

      <div className="verdict-doc">
        <p className="mono muted small" style={{ margin: 0 }}>
          VERDICT № {String(record.seq).padStart(3, "0")} · sealed {record.finalized_at} · quorum{" "}
          {record.quorum_percent}%
        </p>
        <h1 style={{ marginTop: "0.75rem" }}>{record.title}</h1>
        {record.context && <p className="muted">{record.context}</p>}

        <p className="decided">It was decided: {record.winning_label}</p>

        <table>
          <tbody>
            {record.options.map((o) => (
              <tr key={o.id}>
                <td>{o.label}</td>
                <td className="small muted">
                  {o.votes} vote{o.votes === 1 ? "" : "s"}
                  {o.label === record.winning_label ? " · carried" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 style={{ marginTop: "1.75rem" }}>Opinions on record</h2>
        {record.votes.map((v, i) => (
          <div className="testimony" key={i}>
            <p className="who" style={{ margin: 0 }}>
              {v.name} — voted {v.option_label}
            </p>
            <p style={{ margin: "0.25rem 0 0" }}>{v.opinion}</p>
          </div>
        ))}

        <h2 style={{ marginTop: "1.75rem" }}>Participants</h2>
        <p className="small muted">{record.participants.map((p) => p.name).join(" · ")}</p>

        <p className="hashline" style={{ marginTop: "1.5rem" }}>
          seal <span className="h">{record.this_hash}</span>
          <br />
          prev {record.prev_hash}
        </p>
        <p className="small muted">
          This entry can never be edited or deleted — by anyone.{" "}
          <Link href={`/g/${groupId}/verify`}>Verify it yourself</Link>.
        </p>
      </div>
    </main>
  );
}
