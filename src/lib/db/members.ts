import type { Pool } from "pg";

export const MAX_NAME_LENGTH = 80;

export interface UpsertMemberInput {
  id: string;
  name: string;
  email: string;
}

/**
 * Creates the member row on first sign-in. On later sign-ins only the email
 * is refreshed — the name belongs to the user once set (see updateMemberName),
 * so auth-derived names must never clobber it. Returns the stored name.
 */
export async function upsertMember(pool: Pool, input: UpsertMemberInput): Promise<string> {
  const { rows } = await pool.query(
    `insert into members (id, name, email) values ($1, $2, $3)
     on conflict (id) do update set email = excluded.email
     returning name`,
    [input.id, input.name, input.email]
  );
  return rows[0].name;
}

export async function updateMemberName(pool: Pool, memberId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new Error("name cannot be empty");
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(`name must be ${MAX_NAME_LENGTH} characters or fewer`);
  }
  await pool.query("update members set name = $1 where id = $2", [trimmed, memberId]);
}
