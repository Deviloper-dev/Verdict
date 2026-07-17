# Instant password signup + UI/UX fixes — design

**Date:** 2026-07-17
**Motivation:** Friends can't sign up — Supabase's built-in mailer (~2 emails/hour project-wide) rate-limits the signup **confirmation email**, stalling everyone after the first couple of accounts even though password auth already shipped (`c3842c6`). Separately, the UI has interaction gaps: cards navigate only via their title link, buttons give no pending feedback, and there are no mobile styles.

## Decisions

- **Email confirmation is disabled permanently** (user decision, 2026-07-17). Signup becomes pure email + password with zero emails sent. Accepted trade-off: an address is no longer proven at signup, so someone could register another person's email and inherit group memberships granted to that address by `addMember`. This supersedes the "confirmation stays ON" decision in `2026-07-09-password-auth-design.md`.
- **Magic link stays** as the forgot-password fallback. Its rare use fits within the built-in mailer quota, so no custom SMTP is needed now.
- **Auth0 is not used.** It adds redirect friction and its free tier has its own email limits; the integration may stay configured but gets no UI.

## 1. Auth — instant signup

**Supabase dashboard (config, no code):** Authentication → Sign In / Providers → Email → turn **off "Confirm email"**. With it off, `supabase.auth.signUp()` returns a session immediately and sends nothing.

**`src/app/login/page.tsx`:**

- Signup branch: if `signUp()` returns a session → `location.href = "/"` (full navigation so `src/proxy.ts` sees fresh cookies, same as sign-in).
- Fallback: if no session is returned (toggle not yet flipped), keep the check-your-email notice but add a "← back to sign in" link — the notice currently replaces the form with no way back.

**Existing unconfirmed accounts:** verify that users who signed up before the change but never confirmed can now sign in. If Supabase still blocks them, clear `email_confirmed_at` obstacles via SQL on those `auth.users` rows.

## 2. UI/UX fixes

### 2.1 Whole-card click targets

Cards on home (groups), group page (polls), ledger (records), and search (results) become fully clickable via the stretched-link pattern: `.card` gets `position: relative`; the title `<Link>` gets a class whose `::after` covers the card. Secondary links inside a card (e.g. "read the verdict") get `position: relative; z-index: 1` so they stay independently clickable. Strengthen the existing hover border shift and add `cursor: pointer`.

### 2.2 Pending states on all mutating forms

New client component `src/app/SubmitButton.tsx` using `useFormStatus`: renders a button that disables while the enclosing server-action form is pending and swaps to a per-form pending label ("Creating…", "Casting vote…", etc.). Applied to: create group, display name, add member, new poll, cast vote, add/remove participant, withdraw, sign out. The login page (client component, not server actions) gets an equivalent local `busy` state disabling its buttons.

### 2.3 Mobile responsiveness

`globals.css` gains a small-screen media query (~≤560px): topbar switches to wrapping flex with gaps (nav currently overflows), `h1` scales down, `.shell` padding tightens, form buttons get comfortable tap sizing. Verify no horizontal scroll on a 390px viewport.

### 2.4 Clickable vote option rows

On the poll page, each `.option-row` is restructured so the `<label>` element IS the row (carrying the `.option-row` class and containing the radio + text) — clicking anywhere in the bordered row selects the radio.

### 2.5 Topbar dropdown behavior

The `<details class="name-editor">` popovers (display name, password) close on outside click via a small client wrapper component around `<details>` (document-level pointerdown listener). On narrow screens the absolutely-positioned popover is kept within the viewport (right-anchored with `max-width`).

### 2.6 Add-member success feedback

`addMemberByEmailAction` redirects back with `?added=<name>` on success; the group page renders a green `.notice` ("<name> added to the group"), mirroring the existing `?error` pattern.

### 2.7 Strip consumed query params

Small client component (rendered on pages that show `?error`/`?added`) that after mount calls `history.replaceState` to remove those params, so messages don't reappear on refresh or in shared URLs. Display still comes from the server render.

### 2.8 Login page polish

Magic link moves out of the prose sentence into a visible quiet button ("Email me a sign-in link") under a subtle divider; Google joins it in the secondary area. Primary flow (email + password + submit) stays on top. Mode toggle (sign in ↔ create account) unchanged. Both magic-link and signup-fallback notices include a way back to the form.

## Untouched

Chain library (`src/lib/chain/`), write path (`src/lib/db/`), RLS, `/auth/callback`, verify flow (manual "Run verification" button is deliberate), search backend, `PasswordForm` logic (only its popover container behavior changes).

## Testing & verification

No DB or chain surface → no new vitest coverage.

1. `pnpm typecheck`, `pnpm build`, `pnpm test` pass.
2. Live click-through (local dev, Chrome DevTools, desktop + 390px mobile viewport): fresh email+password signup lands signed-in with zero emails; whole-card navigation works on all four card surfaces while inner secondary links still work; double-click on submit produces one group/vote; option-row click selects radio; dropdowns close on outside click; add-member shows notice; `?error`/`?added` disappear from the URL after render.
3. Production after deploy: one real signup on verdict.deviloper.dev.
