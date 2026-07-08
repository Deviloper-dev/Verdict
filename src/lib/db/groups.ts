import type { Pool } from "pg";

export async function createGroup(
  pool: Pool,
  input: { name: string; created_by: string }
): Promise<{ id: string }> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const g = await client.query("insert into groups (name, created_by) values ($1, $2) returning id", [
      input.name,
      input.created_by,
    ]);
    const groupId: string = g.rows[0].id;
    await client.query("insert into group_members (group_id, member_id) values ($1, $2)", [
      groupId,
      input.created_by,
    ]);
    await client.query("commit");
    return { id: groupId };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function addGroupMember(
  pool: Pool,
  input: { group_id: string; member_id: string }
): Promise<void> {
  await pool.query("insert into group_members (group_id, member_id) values ($1, $2)", [
    input.group_id,
    input.member_id,
  ]);
}

export async function listGroupMembers(
  pool: Pool,
  groupId: string
): Promise<{ member_id: string; name: string }[]> {
  const { rows } = await pool.query(
    `select gm.member_id, m.name
       from group_members gm join members m on m.id = gm.member_id
      where gm.group_id = $1 order by m.name`,
    [groupId]
  );
  return rows;
}
