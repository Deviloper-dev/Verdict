import { beforeEach, describe, expect, it } from "vitest";
import { addGroupMember, createGroup, listGroupMembers } from "../../src/lib/db/groups";
import { getPool, resetDb } from "./setup";

const hasDb = !!process.env.DATABASE_URL;

async function makeMember(name: string): Promise<string> {
  const r = await getPool().query("insert into members (name, email) values ($1, $2) returning id", [
    name,
    `${name.toLowerCase()}@example.com`,
  ]);
  return r.rows[0].id;
}

describe.runIf(hasDb)("groups service", () => {
  beforeEach(resetDb);

  it("createGroup makes the creator a group member", async () => {
    const yogi = await makeMember("Yogi");
    const { id: groupId } = await createGroup(getPool(), { name: "College Friends", created_by: yogi });
    const members = await listGroupMembers(getPool(), groupId);
    expect(members).toEqual([{ member_id: yogi, name: "Yogi" }]);
  });

  it("addGroupMember adds and rejects duplicates", async () => {
    const yogi = await makeMember("Yogi");
    const asha = await makeMember("Asha");
    const { id: groupId } = await createGroup(getPool(), { name: "G", created_by: yogi });
    await addGroupMember(getPool(), { group_id: groupId, member_id: asha });
    expect((await listGroupMembers(getPool(), groupId)).map((m) => m.name).sort()).toEqual(["Asha", "Yogi"]);
    await expect(addGroupMember(getPool(), { group_id: groupId, member_id: asha })).rejects.toThrow(
      /duplicate|unique/i
    );
  });
});
