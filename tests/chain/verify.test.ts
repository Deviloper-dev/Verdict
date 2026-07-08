import { describe, expect, it } from "vitest";
import { computeRecordHash } from "../../src/lib/chain/hash";
import { verifyChain } from "../../src/lib/chain/verify";
import { buildChain } from "./helpers";

describe("verifyChain", () => {
  it("passes a valid chain", async () => {
    const chain = await buildChain("g-1", 4);
    const result = await verifyChain("g-1", chain);
    expect(result).toEqual({ valid: true, checked: 4, failures: [] });
  });

  it("passes an empty chain with no anchor", async () => {
    expect((await verifyChain("g-1", [])).valid).toBe(true);
  });

  it("detects a tampered field (hash mismatch at that seq)", async () => {
    const chain = await buildChain("g-1", 4);
    chain[2]!.votes[0]!.opinion = "REWRITTEN";
    const result = await verifyChain("g-1", chain);
    expect(result.valid).toBe(false);
    expect(result.failures).toContainEqual({ kind: "hash_mismatch", seq: 3 });
  });

  it("detects a re-hashed record (link break at the next seq)", async () => {
    // Attacker edits record 2 AND recomputes its hash — record 3's prev_hash exposes it.
    const chain = await buildChain("g-1", 4);
    chain[1]!.title = "REWRITTEN";
    chain[1]!.this_hash = await computeRecordHash(chain[1]!);
    const result = await verifyChain("g-1", chain);
    expect(result.valid).toBe(false);
    expect(result.failures).toContainEqual({ kind: "link_broken", seq: 3 });
  });

  it("detects a deleted record (seq gap)", async () => {
    const chain = await buildChain("g-1", 4);
    chain.splice(1, 1); // delete seq 2
    const result = await verifyChain("g-1", chain);
    expect(result.valid).toBe(false);
    expect(result.failures).toContainEqual({ kind: "seq_gap", expected: 2, found: 3 });
  });

  it("detects a wrong genesis (spliced chain from another group)", async () => {
    const chain = await buildChain("g-other", 2);
    const result = await verifyChain("g-1", chain);
    expect(result.valid).toBe(false);
    expect(result.failures).toContainEqual({ kind: "bad_genesis", seq: 1 });
  });

  it("detects a truncated tail via anchor", async () => {
    const chain = await buildChain("g-1", 4);
    const anchor = { seq: 4, this_hash: chain[3]!.this_hash };
    const truncated = chain.slice(0, 2);
    const result = await verifyChain("g-1", truncated, anchor);
    expect(result.valid).toBe(false);
    expect(result.failures).toContainEqual({ kind: "truncated", anchorSeq: 4, headSeq: 2 });
  });

  it("detects anchor mismatch (whole-suffix rewrite)", async () => {
    const honest = await buildChain("g-1", 3);
    const rewritten = await buildChain("g-1", 3);
    rewritten[2]!.title = "REWRITTEN HISTORY";
    rewritten[2]!.this_hash = await computeRecordHash(rewritten[2]!);
    const anchor = { seq: 3, this_hash: honest[2]!.this_hash };
    const result = await verifyChain("g-1", rewritten, anchor);
    expect(result.valid).toBe(false);
    expect(result.failures).toContainEqual({ kind: "anchor_mismatch", seq: 3 });
  });

  it("passes when anchor matches", async () => {
    const chain = await buildChain("g-1", 3);
    const anchor = { seq: 2, this_hash: chain[1]!.this_hash };
    expect((await verifyChain("g-1", chain, anchor)).valid).toBe(true);
  });
});
