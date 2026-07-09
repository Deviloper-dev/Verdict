# Password auth + max-length sessions — design

**Date:** 2026-07-09
**Motivation:** Supabase's built-in email service is rate-limited (a handful of emails/hour), and every magic-link sign-in burns one. Password login removes email from the sign-in path entirely; email is then only needed once per account (signup confirmation). Separately, sessions should keep users logged in as long as browsers allow.

## Decisions

- **Email confirmation stays ON** (Supabase default). Group membership is granted by email lookup (`src/app/actions.ts` `addMember`), so proving email ownership at signup is the app's identity boundary. Cost: one confirmation email per new account.
- **No dedicated forgot-password flow.** The existing magic-link option doubles as account recovery: sign in via link, then set a new password from the home page.
- **No custom SMTP for now.** Worth doing later regardless (Resend/Brevo free tier lifts the rate limit for magic links and confirmations), but out of scope.

## 1. Login page — `src/app/login/page.tsx`

Stays a client component. Add a password field and a Sign in / Sign up mode toggle (default: Sign in), styled with existing classes (`.card`, `.quiet`, `.error`, `.notice`); no new CSS unless spacing needs it.

- **Sign in:** `supabase.auth.signInWithPassword({ email, password })`. On success, `location.href = "/"` — a full navigation, so the server render and `src/proxy.ts` see the fresh session cookies. On failure (e.g. "Invalid login credentials"), show the error inline as the magic-link flow does today.
- **Sign up:** `supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback` } })`. On success show a notice: "Check your email to confirm your account." The existing `/auth/callback` route (`exchangeCodeForSession`) handles the confirmation link unchanged. Password input gets `minLength={6}` to match Supabase's default policy.
- **Magic link** stays as the secondary option, relabeled "Email me a sign-in link instead" so it reads as both alternative login and password recovery. **Google OAuth** button unchanged.

## 2. Set/change password — home page

New small client component `src/app/PasswordForm.tsx` rendered on `src/app/page.tsx` next to the display-name editor, following the same inline-form pattern. One password input (`minLength={6}`) + save button calling `supabase.auth.updateUser({ password })` via the browser client. Success shows a brief confirmation; errors inline.

This closes the gap for existing accounts: Google/magic-link users can set a password once and never touch the email rate limit again. Supabase identities are per-user, not per-provider — `updateUser({ password })` adds an email credential to the same user id, so `members` rows and group membership are untouched. No server action, no `pg` write-path involvement.

## 3. Session longevity

Sessions are already indefinite at the Supabase layer: refresh tokens do not expire, and *Time-box user sessions* / *Inactivity timeout* are opt-in features that are off. The practical limit is the cookie: `@supabase/ssr` defaults to `maxAge` of 400 days — the browser ceiling — re-set on every session refresh (sliding window), so any user who visits at least once every ~13 months stays logged in forever.

Change: pin this explicitly so a future `@supabase/ssr` default change can't silently shorten it. Pass `cookieOptions: { maxAge: 400 * 24 * 60 * 60 }` at all three client-creation sites:

- `src/lib/auth/client.ts` (`createBrowserClient`)
- `src/lib/auth/server.ts` (`createServerClient`)
- `src/proxy.ts` (`createServerClient`)

Dashboard checklist (no code): confirm *Time-box user sessions* and *Inactivity timeout* remain disabled in Supabase Auth settings.

## 4. Untouched

`requireMember`/`upsertMember` (auth-method-agnostic), the `/auth/callback` route, RLS policies, the chain library, and the `pg` write path. Supabase dashboard "Confirm email" stays at its default (on).

## 5. Testing & verification

No DB or chain surface → no new vitest coverage. Verification:

1. `pnpm typecheck` and `pnpm build` pass.
2. Manual: sign up with a fresh email → confirmation email → link lands on `/auth/callback` → signed in, members row created.
3. Manual: wrong password shows inline error; correct password signs in with zero emails sent.
4. Manual: existing magic-link account sets a password on the home page, signs out, signs back in with the password.
5. Cookie check: after sign-in, the `sb-*` auth cookies show a ~400-day expiry in devtools.
