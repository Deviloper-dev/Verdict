import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPool } from "../db/pool";

export async function createSupabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars are not set — see .env.example");
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — middleware handles session refresh.
        }
      },
    },
  });
}

export interface SessionMember {
  id: string;
  name: string;
  email: string;
}

/**
 * Returns the signed-in member, creating/refreshing their members row
 * (members.id == Supabase Auth user id). Redirects to /login if signed out.
 */
export async function requireMember(): Promise<SessionMember> {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) redirect("/login");

  const name =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email.split("@")[0]!;

  await getPool().query(
    `insert into members (id, name, email) values ($1, $2, $3)
     on conflict (id) do update set name = excluded.name, email = excluded.email`,
    [user.id, name, user.email]
  );
  return { id: user.id, name, email: user.email };
}
