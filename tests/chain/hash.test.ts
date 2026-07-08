import { describe, expect, it } from "vitest";
import { computeRecordHash, genesisHash, sha256Hex, HASH_VERSION } from "../../src/lib/chain/hash";
import type { RecordFields } from "../../src/lib/chain/types";

const baseFields: RecordFields = {
  seq: 1,
  group_id: "g-1",
  poll_id: "p-1",
  title: "Split rent how?",
  context: "March flat debate",
  options: [
    { id: "o1", label: "By headcount" },
    { id: "o2", label: "By room size" },
  ],
  participants: [{ member_id: "m1", name: "Yogi", added_at: "2026-07-08T00:00:00Z" }],
  votes: [{ participant_id: "pt1", option_id: "o1", opinion: "simpler", voted_at: "2026-07-08T01:00:00Z" }],
  winning_option_id: "o1",
  quorum_percent: 60,
  finalized_at: "2026-07-08T02:00:00Z",
  prev_hash: "0".repeat(64),
  hash_version: HASH_VERSION,
};

describe("sha256Hex", () => {
  it("matches the NIST test vector for 'abc'", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
});

describe("genesisHash", () => {
  it("is deterministic and equals SHA256('verdict-genesis:'+groupId)", async () => {
    expect(await genesisHash("g-1")).toBe(await sha256Hex("verdict-genesis:g-1"));
    expect(await genesisHash("g-1")).not.toBe(await genesisHash("g-2"));
  });
});

describe("computeRecordHash", () => {
  it("is deterministic for identical fields", async () => {
    expect(await computeRecordHash(baseFields)).toBe(await computeRecordHash({ ...baseFields }));
  });

  it("changes when any field changes", async () => {
    const h = await computeRecordHash(baseFields);
    expect(await computeRecordHash({ ...baseFields, title: "x" })).not.toBe(h);
    expect(await computeRecordHash({ ...baseFields, seq: 2 })).not.toBe(h);
  });

  it("ignores properties outside the 13-field contract", async () => {
    const extra = { ...baseFields, this_hash: "should-not-matter" } as RecordFields;
    expect(await computeRecordHash(extra)).toBe(await computeRecordHash(baseFields));
  });

  it("rejects unsupported hash_version", async () => {
    await expect(computeRecordHash({ ...baseFields, hash_version: 99 })).rejects.toThrow(/hash_version/);
  });
});
