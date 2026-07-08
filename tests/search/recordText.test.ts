import { describe, expect, it } from "vitest";
import { buildRecordText } from "../../src/lib/search/recordText";

describe("buildRecordText", () => {
  it("includes title, context, decision, and every opinion with names", () => {
    const text = buildRecordText({
      title: "How do we split rent?",
      context: "The March flat argument",
      winning_option_id: "o1",
      options_snapshot: [
        { id: "o1", label: "By room size" },
        { id: "o2", label: "Evenly" },
      ],
      participants_snapshot: [
        { member_id: "m1", name: "Yogi" },
        { member_id: "m2", name: "Asha" },
      ],
      votes_snapshot: [
        { participant_id: "m1", option_id: "o1", opinion: "bigger room, bigger share" },
        { participant_id: "m2", option_id: "o1", opinion: "fair enough" },
      ],
    });
    expect(text).toContain("How do we split rent?");
    expect(text).toContain("The March flat argument");
    expect(text).toContain("Decided: By room size");
    expect(text).toContain("Yogi voted By room size: bigger room, bigger share");
    expect(text).toContain("Asha voted By room size: fair enough");
  });

  it("omits empty context", () => {
    const text = buildRecordText({
      title: "T",
      context: "",
      winning_option_id: "o1",
      options_snapshot: [{ id: "o1", label: "A" }],
      participants_snapshot: [],
      votes_snapshot: [],
    });
    expect(text).toBe("T\nDecided: A");
  });
});
