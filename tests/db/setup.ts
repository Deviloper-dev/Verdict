import { Pool } from "pg";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  }
  return pool;
}

export async function resetDb(): Promise<void> {
  await getPool().query(
    "truncate votes, participants, options, polls, group_members, groups, members, records cascade"
  );
}

/** Seed one member + group + poll; returns their ids. */
export async function seedGroup(): Promise<{ memberId: string; groupId: string; pollId: string }> {
  const p = getPool();
  const m = await p.query(
    "insert into members (name, email) values ('Yogi', 'yogi@example.com') returning id"
  );
  const memberId: string = m.rows[0].id;
  const g = await p.query("insert into groups (name, created_by) values ('Test Group', $1) returning id", [
    memberId,
  ]);
  const groupId: string = g.rows[0].id;
  const poll = await p.query(
    "insert into polls (group_id, created_by, title, quorum_percent) values ($1, $2, 'T', 60) returning id",
    [groupId, memberId]
  );
  return { memberId, groupId, pollId: poll.rows[0].id };
}
