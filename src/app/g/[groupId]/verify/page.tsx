"use client";

import Link from "next/link";
import { use, useState } from "react";
import type { AnchorPoint, StoredRecord, VerifyResult } from "../../../../lib/chain/types";
import { verifyChain } from "../../../../lib/chain/verify";

export default function VerifyPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [anchorUsed, setAnchorUsed] = useState<(AnchorPoint & { anchored_at?: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runVerification() {
    setState("running");
    setError(null);
    try {
      const res = await fetch(`/g/${groupId}/verify/data`);
      if (!res.ok) throw new Error(`could not fetch records (${res.status})`);
      const data = (await res.json()) as {
        records: StoredRecord[];
        anchor: (AnchorPoint & { anchored_at?: string }) | null;
      };
      // The hashes are recomputed HERE, in your browser — not by the server.
      const verdict = await verifyChain(groupId, data.records, data.anchor ?? undefined);
      setAnchorUsed(data.anchor);
      setResult(verdict);
      setCheckedAt(new Date().toLocaleString());
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "verification failed to run");
      setState("error");
    }
  }

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

      <h1>Verify the chain</h1>
      <p className="muted">
        Your browser downloads the raw records and recomputes every hash locally. You are not trusting the
        server&rsquo;s word — you are checking its math.
      </p>

      <button onClick={runVerification} disabled={state === "running"}>
        {state === "running" ? "Recomputing hashes…" : "Run verification"}
      </button>

      {state === "error" && <p className="error">{error}</p>}

      {state === "done" && result && (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          {result.valid ? (
            <>
              <h3 style={{ color: "var(--green)" }}>✓ Chain intact</h3>
              <p className="small muted">
                {result.checked} record{result.checked === 1 ? "" : "s"} verified · every hash matches ·
                every link holds · checked {checkedAt}
              </p>
              {anchorUsed ? (
                <p className="small" style={{ color: "var(--green)" }}>
                  ✓ Matches the public anchor (№ {anchorUsed.seq}
                  {anchorUsed.anchored_at ? `, anchored ${new Date(anchorUsed.anchored_at).toLocaleString()}` : ""}
                  ) — history older than that anchor cannot have been rewritten by anyone, including the
                  admin.
                </p>
              ) : (
                <p className="small muted">
                  No public anchor configured yet — this proves internal consistency only. Once anchoring is
                  set up, verification also checks the chain against a hash published outside the server.
                </p>
              )}
              {result.checked === 0 && <p className="small muted">(The ledger is empty — nothing to break yet.)</p>}
            </>
          ) : (
            <>
              <h3 style={{ color: "var(--red)" }}>✗ Chain broken</h3>
              <p className="small">
                {result.failures.length} problem{result.failures.length === 1 ? "" : "s"} found — someone or
                something has altered the ledger:
              </p>
              <table>
                <tbody>
                  {result.failures.map((f, i) => (
                    <tr key={i}>
                      <td className="mono small">
                        {"seq" in f ? `№ ${f.seq}` : `№ ${"found" in f ? f.found : "?"}`}
                      </td>
                      <td className="small">
                        {f.kind === "hash_mismatch" && "record contents don't match their seal"}
                        {f.kind === "link_broken" && "link to the previous record is broken"}
                        {f.kind === "bad_genesis" && "chain doesn't start from this group's genesis"}
                        {f.kind === "seq_gap" && `a record is missing (expected № ${f.expected})`}
                        {f.kind === "truncated" && `the tail of the chain has been deleted (anchor says № ${f.anchorSeq} exists)`}
                        {f.kind === "anchor_mismatch" && "chain disagrees with the public anchor"}
                        {f.kind === "unsupported_hash_version" && "unknown hash version"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </main>
  );
}
