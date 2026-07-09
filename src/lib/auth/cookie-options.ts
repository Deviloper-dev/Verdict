/**
 * Auth cookies live as long as browsers allow (Chrome/Safari cap cookies at
 * 400 days). Supabase refresh tokens never expire, and the middleware re-sets
 * this maxAge on every session refresh, so active users stay signed in
 * indefinitely. Pinned explicitly so an @supabase/ssr default change can't
 * silently shorten sessions.
 */
export const AUTH_COOKIE_OPTIONS = { maxAge: 400 * 24 * 60 * 60 };
