import { beforeEach, describe, expect, it } from "vitest";
import { updateMemberName, upsertMember } from "../../src/lib/db/members";
import { getPool, resetDb } from "./setup";

const hasDb = !!process.env.DATABASE_URL;

const AUTH_ID = "7f9b2a44-0000-4000-8000-000000000001";

describe.runIf(hasDb)("members service", () => {
  beforeEach(resetDb);

  it("upsertMember creates the member with the derived name on first sign-in", async () => {
    const name = await upsertMember(getPool(), { id: AUTH_ID, name: "yogi", email: "yogi@example.com" });
    expect(name).toBe("yogi");
    const { rows } = await getPool().query("select name, email from members where id = $1", [AUTH_ID]);
    expect(rows[0]).toEqual({ name: "yogi", email: "yogi@example.com" });
  });

  it("upsertMember never clobbers an existing name, but refreshes email", async () => {
    await upsertMember(getPool(), { id: AUTH_ID, name: "yogi", email: "yogi@example.com" });
    await updateMemberName(getPool(), AUTH_ID, "Yogesh Joshi");
    const name = await upsertMember(getPool(), { id: AUTH_ID, name: "yogi", email: "new@example.com" });
    expect(name).toBe("Yogesh Joshi");
    const { rows } = await getPool().query("select name, email from members where id = $1", [AUTH_ID]);
    expect(rows[0]).toEqual({ name: "Yogesh Joshi", email: "new@example.com" });
  });

  it("updateMemberName trims and persists the new name", async () => {
    await upsertMember(getPool(), { id: AUTH_ID, name: "yogi", email: "yogi@example.com" });
    await updateMemberName(getPool(), AUTH_ID, "  Yogi  ");
    const { rows } = await getPool().query("select name from members where id = $1", [AUTH_ID]);
    expect(rows[0].name).toBe("Yogi");
  });

  it("updateMemberName rejects empty and over-long names", async () => {
    await upsertMember(getPool(), { id: AUTH_ID, name: "yogi", email: "yogi@example.com" });
    await expect(updateMemberName(getPool(), AUTH_ID, "   ")).rejects.toThrow(/name/i);
    await expect(updateMemberName(getPool(), AUTH_ID, "x".repeat(81))).rejects.toThrow(/80/);
    const { rows } = await getPool().query("select name from members where id = $1", [AUTH_ID]);
    expect(rows[0].name).toBe("yogi");
  });
});
