import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../src/lib/chain/canonical";

describe("canonicalJson", () => {
  it("sorts object keys lexicographically at every depth", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("is byte-identical regardless of insertion order", () => {
    const x = { title: "t", seq: 1, votes: [{ b: "2", a: "1" }] };
    const y = { votes: [{ a: "1", b: "2" }], seq: 1, title: "t" };
    expect(canonicalJson(x)).toBe(canonicalJson(y));
  });

  it("preserves array order (arrays are significant)", () => {
    expect(canonicalJson([2, 1])).toBe("[2,1]");
  });

  it("escapes strings per JSON rules", () => {
    expect(canonicalJson({ s: 'a"b\n' })).toBe('{"s":"a\\"b\\n"}');
  });

  it("rejects non-integer numbers (out of our JCS-safe subset)", () => {
    expect(() => canonicalJson({ x: 1.5 })).toThrow(/integer/);
    expect(() => canonicalJson({ x: NaN })).toThrow(/integer/);
  });

  it("rejects undefined and functions", () => {
    expect(() => canonicalJson(undefined)).toThrow();
    expect(() => canonicalJson({ f: () => 1 })).toThrow();
  });
});
