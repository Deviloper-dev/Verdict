import { computeRecordHash, genesisHash, HASH_VERSION } from "./hash";
import type { AnchorPoint, ChainFailure, StoredRecord, VerifyResult } from "./types";

/**
 * Verifies a group's full chain: recomputes every hash, checks prev-links,
 * seq contiguity, genesis binding, and (optionally) an external anchor.
 * Isomorphic — runs identically in Node and the browser.
 */
export async function verifyChain(
  groupId: string,
  records: StoredRecord[],
  anchor?: AnchorPoint
): Promise<VerifyResult> {
  const failures: ChainFailure[] = [];
  const sorted = [...records].sort((a, b) => a.seq - b.seq);

  let expectedPrev = await genesisHash(groupId);
  let expectedSeq = 1;

  for (const rec of sorted) {
    if (rec.seq !== expectedSeq) {
      failures.push({ kind: "seq_gap", expected: expectedSeq, found: rec.seq });
    }
    if (rec.hash_version !== HASH_VERSION) {
      failures.push({ kind: "unsupported_hash_version", seq: rec.seq });
    } else {
      if (rec.prev_hash !== expectedPrev) {
        failures.push({ kind: rec.seq === 1 ? "bad_genesis" : "link_broken", seq: rec.seq });
      }
      if ((await computeRecordHash(rec)) !== rec.this_hash) {
        failures.push({ kind: "hash_mismatch", seq: rec.seq });
      }
    }
    expectedPrev = rec.this_hash;
    expectedSeq = rec.seq + 1;
  }

  if (anchor) {
    const head = sorted[sorted.length - 1];
    if (!head || anchor.seq > head.seq) {
      failures.push({ kind: "truncated", anchorSeq: anchor.seq, headSeq: head?.seq ?? 0 });
    } else {
      const at = sorted.find((r) => r.seq === anchor.seq);
      if (!at || at.this_hash !== anchor.this_hash) {
        failures.push({ kind: "anchor_mismatch", seq: anchor.seq });
      }
    }
  }

  return { valid: failures.length === 0, checked: sorted.length, failures };
}
