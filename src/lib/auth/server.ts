import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { upsertMember } from "../db/members";
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
 * Returns the signed-in member, creating their members row on first sign-in
 * (members.id == Supabase Auth user id). The auth-derived name is only a
 * default for that first insert — the stored name is the source of truth
 * once the user edits it. Redirects to /login if signed out.
 */
export async function requireMember(): Promise<SessionMember> {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) redirect("/login");

  const defaultName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email.split("@")[0]!;

  const name = await upsertMember(getPool(), { id: user.id, name: defaultName, email: user.email });
  return { id: user.id, name, email: user.email };
}
