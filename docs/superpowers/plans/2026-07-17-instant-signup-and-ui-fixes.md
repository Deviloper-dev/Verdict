# Instant Password Signup + UI/UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Friends sign up with email + password and land in the app instantly (no confirmation email), and the UI gets 8 interaction fixes (whole-card clicks, pending buttons, mobile styles, clickable option rows, dropdown close, add-member notice, URL cleanup, login polish).

**Architecture:** Supabase "Confirm email" is turned off (dashboard config); the login page redirects on the session `signUp()` now returns. UI fixes are three tiny shared client components (`SubmitButton`, `DetailsPopover`, `ClearQueryParams`) plus CSS (stretched-link cards, media queries) threaded through the existing server-component pages. No DB, chain, or RLS surface is touched.

**Tech Stack:** Next.js App Router, React 19 (`useFormStatus`), `@supabase/ssr` browser client, plain CSS in `globals.css`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-17-instant-signup-and-ui-fixes-design.md`.
- No new vitest coverage (no DB/chain surface). Per-task verification is `pnpm typecheck`; final verification adds `pnpm build`, `pnpm test`, and a live click-through (desktop + 390px viewport).
- Dark theme, plain CSS only — no Tailwind, no component library. Reuse existing classes (`.card`, `.quiet`, `.notice`, `.error`, `.small`, `.muted`).
- Do not touch `src/lib/chain/`, `src/lib/db/` (except nothing — `actions.ts` is app-layer), RLS, `/auth/callback`, or the verify flow's manual button.
- Magic link stays as the forgot-password fallback; Auth0 gets no UI.
- Leave the uncommitted `next.config.ts` change (`allowedDevOrigins`) out of all commits.

---

### Task 1: Shared client components

**Files:**
- Create: `src/app/SubmitButton.tsx`
- Create: `src/app/DetailsPopover.tsx`
- Create: `src/app/ClearQueryParams.tsx`

**Interfaces:**
- Produces: `SubmitButton({ children, pendingLabel, className?, style? })` — submit button that disables + swaps label while the enclosing form's server action runs.
- Produces: `DetailsPopover({ summary, title?, children })` — `<details class="name-editor">` that closes on outside click. Server-action forms may be passed as children.
- Produces: `ClearQueryParams({ params: string[] })` — renders nothing; strips the named query params from the URL after mount.

- [ ] **Step 1: Write `src/app/SubmitButton.tsx`**

```tsx
"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button for server-action forms: disables and swaps its label while
 * the action is pending, so double-clicks can't fire the mutation twice.
 */
export default function SubmitButton({
  children,
  pendingLabel,
  className,
  style,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} style={style} disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
```

- [ ] **Step 2: Write `src/app/DetailsPopover.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";

/**
 * A <details> popover (name/password editors in the topbar) that also closes
 * when the user clicks anywhere outside it.
 */
export default function DetailsPopover({
  summary,
  title,
  children,
}: {
  summary: React.ReactNode;
  title?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const el = ref.current;
      if (el?.open && e.target instanceof Node && !el.contains(e.target)) {
        el.open = false;
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <details className="name-editor" ref={ref}>
      <summary title={title}>{summary}</summary>
      {children}
    </details>
  );
}
```

- [ ] **Step 3: Write `src/app/ClearQueryParams.tsx`**

```tsx
"use client";

import { useEffect } from "react";

/**
 * Strips consumed one-shot query params (?error=, ?added=) from the address
 * bar after the server render has displayed them, so refreshes and shared
 * URLs don't resurrect stale messages. Renders nothing.
 */
export default function ClearQueryParams({ params }: { params: string[] }) {
  useEffect(() => {
    const url = new URL(location.href);
    let changed = false;
    for (const p of params) {
      if (url.searchParams.has(p)) {
        url.searchParams.delete(p);
        changed = true;
      }
    }
    if (changed) history.replaceState(null, "", url);
  }, [params]);
  return null;
}
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/SubmitButton.tsx src/app/DetailsPopover.tsx src/app/ClearQueryParams.tsx
git commit -m "feat(ui): SubmitButton, DetailsPopover, ClearQueryParams primitives"
```

---

### Task 2: CSS — stretched-link cards, clickable option rows, disabled buttons, mobile styles

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `.card-link` class — put it on the title `<Link>` inside a `.card`; an `::after` overlay makes the whole card its click target. Other interactive elements inside the card automatically stay clickable (they're raised above the overlay).
- Produces: `label.option-row` styling — the `<label>` element IS the row (Task 5 restructures the markup).

- [ ] **Step 1: Add stretched-link rules**

In `src/app/globals.css`, after the `.card h3 a { ... }` rule (line ~122), add:

```css
/* Whole-card click target: the title link's ::after covers the card. */
.card {
  position: relative;
}
.card-link::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 10px;
}
/* Everything else interactive inside a card stays above the overlay. */
.card a:not(.card-link),
.card form,
.card button {
  position: relative;
  z-index: 1;
}
```

- [ ] **Step 2: Strengthen card hover + disabled buttons**

Replace the existing hover block at the bottom of the file:

```css
@media (prefers-reduced-motion: no-preference) {
  .card {
    transition: border-color 140ms ease;
  }
  .card:hover {
    border-color: color-mix(in srgb, var(--violet) 35%, var(--border));
  }
}
```

with:

```css
@media (prefers-reduced-motion: no-preference) {
  .card {
    transition: border-color 140ms ease, background 140ms ease;
  }
}
.card:has(.card-link):hover {
  border-color: color-mix(in srgb, var(--violet) 45%, var(--border));
  background: color-mix(in srgb, var(--violet) 4%, var(--surface));
}
.card:hover {
  border-color: color-mix(in srgb, var(--violet) 35%, var(--border));
}

button:disabled,
.btn:disabled {
  opacity: 0.55;
  cursor: progress;
}
```

- [ ] **Step 3: Make `.option-row` a label row**

Replace the existing `.option-row` block:

```css
.option-row {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 0.5rem;
  background: var(--surface-2);
}
.option-row input[type="radio"] {
  margin-top: 0.25rem;
  accent-color: var(--violet);
}
```

with (works whether the row is a `<div>` or a `<label>`; overrides the global muted `label` styling):

```css
.option-row {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  margin: 0 0 0.5rem;
  background: var(--surface-2);
  font-size: 1rem;
  color: var(--text);
  cursor: pointer;
}
.option-row:hover {
  border-color: color-mix(in srgb, var(--violet) 35%, var(--border));
}
.option-row input[type="radio"] {
  margin-top: 0.25rem;
  accent-color: var(--violet);
  cursor: pointer;
}
```

- [ ] **Step 4: Popover width + login secondary-auth styles**

Change the `.name-editor form.card` rule's `width: 220px;` to `width: min(240px, 86vw);` (keeps the right-anchored popover on-screen on narrow phones).

Then add, after the `.notice` rule:

```css
/* Login page: divider between primary (password) and secondary auth paths. */
.divider {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  color: var(--muted);
  font-size: 0.8rem;
  margin-top: 1.4rem;
  letter-spacing: 0.04em;
}
.divider::before,
.divider::after {
  content: "";
  height: 1px;
  background: var(--border);
  flex: 1;
}
.alt-auth {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}
.alt-auth button {
  margin-top: 0.9rem;
}
```

- [ ] **Step 5: Mobile media query**

Add at the end of the file:

```css
@media (max-width: 560px) {
  .shell {
    padding: 1.5rem 1rem 4rem;
  }
  h1 {
    font-size: 1.55rem;
  }
  .topbar {
    flex-wrap: wrap;
    row-gap: 0.4rem;
    margin-bottom: 1.75rem;
  }
  button,
  .btn {
    padding: 0.6rem 1.1rem; /* comfortable tap target */
  }
  td,
  th {
    padding: 0.45rem 0.4rem;
  }
}
```

- [ ] **Step 6: Verify + commit**

Run: `pnpm typecheck` (expected: exit 0 — CSS isn't typechecked, this guards accidental TS edits).

```bash
git add src/app/globals.css
git commit -m "feat(ui): stretched-link cards, label option rows, disabled buttons, mobile styles"
```

---

### Task 3: Login page — instant signup + polish

**Files:**
- Modify: `src/app/login/page.tsx` (full rewrite below)

**Interfaces:**
- Consumes: nothing new — `createSupabaseBrowser` from `../../lib/auth/client`.
- Produces: n/a (leaf page).

- [ ] **Step 1: Rewrite `src/app/login/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "../../lib/auth/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("signin");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createSupabaseBrowser();
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setBusy(false);
      } else {
        location.href = "/";
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (error) {
        setError(error.message);
        setBusy(false);
      } else if (data.session) {
        // Email confirmation is disabled — the account is live right now.
        location.href = "/";
      } else {
        // Fallback: "Confirm email" is still enabled server-side.
        setNotice(`Check ${email} for a confirmation link to finish signing up.`);
        setBusy(false);
      }
    }
  }

  async function sendMagicLink() {
    if (!email) {
      setError("Enter your email above first, then request a sign-in link.");
      return;
    }
    setError(null);
    setBusy(true);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setNotice(`Sign-in link sent to ${email}. Open it on this device.`);
  }

  async function signInWithGoogle() {
    setBusy(true);
    const supabase = createSupabaseBrowser();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  return (
    <main>
      <div className="topbar">
        <span className="wordmark">Verdict</span>
      </div>
      <h1>Settle it once.</h1>
      <p className="muted">
        The record of what your group actually decided — sealed when everyone required has weighed in,
        provably unchanged forever after. Even the person running it can&rsquo;t rewrite history.
      </p>
      <div className="card" style={{ marginTop: "2rem" }}>
        {notice ? (
          <>
            <p className="notice">{notice}</p>
            <button type="button" className="quiet" onClick={() => setNotice(null)}>
              ← Back to sign in
            </button>
          </>
        ) : (
          <>
            <form onSubmit={submitPassword}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
              />
              <button type="submit" disabled={busy} aria-busy={busy}>
                {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
              </button>
              <p className="small muted" style={{ marginTop: "0.8rem" }}>
                {mode === "signin" ? (
                  <>
                    New here?{" "}
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setError(null);
                        setMode("signup");
                      }}
                    >
                      Create an account
                    </a>{" "}
                    — it&rsquo;s instant, no confirmation email.
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setError(null);
                        setMode("signin");
                      }}
                    >
                      Sign in
                    </a>
                  </>
                )}
              </p>
              {error && <p className="error">{error}</p>}
            </form>
            <div className="divider">or</div>
            <div className="alt-auth">
              <button type="button" className="quiet" onClick={signInWithGoogle} disabled={busy}>
                Sign in with Google
              </button>
              <button type="button" className="quiet" onClick={sendMagicLink} disabled={busy}>
                Email me a sign-in link
              </button>
            </div>
            <p className="small muted" style={{ marginTop: "0.6rem" }}>
              Forgot your password? The sign-in link gets you in — set a new password from the home page.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify + commit**

Run: `pnpm typecheck` — exit 0.

```bash
git add src/app/login/page.tsx
git commit -m "feat(auth): instant signup when confirmation is off; clearer login layout"
```

---

### Task 4: Home page — card links, pending buttons, popovers, URL cleanup

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/PasswordForm.tsx`

**Interfaces:**
- Consumes: `SubmitButton`, `DetailsPopover`, `ClearQueryParams` (Task 1), `.card-link` (Task 2).

- [ ] **Step 1: Refactor `src/app/PasswordForm.tsx` to use `DetailsPopover`**

Replace the outer `<details className="name-editor">…<summary…>…</summary>` / closing `</details>` wrapper with `DetailsPopover`, keeping the form intact:

```tsx
"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "../lib/auth/client";
import DetailsPopover from "./DetailsPopover";

/**
 * Sets or changes the signed-in user's password via Supabase Auth.
 * Lets magic-link/Google accounts adopt a password so future sign-ins
 * don't consume a rate-limited email.
 */
export default function PasswordForm() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    setBusy(true);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else {
      setPassword("");
      setStatus("Password saved. You can now sign in with it.");
    }
  }

  return (
    <DetailsPopover summary="Password" title="Set or change your password">
      <form onSubmit={save} className="card">
        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="At least 6 characters"
        />
        <button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        {status && <p className="notice">{status}</p>}
        {error && <p className="error">{error}</p>}
      </form>
    </DetailsPopover>
  );
}
```

- [ ] **Step 2: Update `src/app/page.tsx`**

Changes: import the three primitives; name editor uses `DetailsPopover` + `SubmitButton`; sign-out uses `SubmitButton`; group-card title link gets `className="card-link"`; create-group form uses `SubmitButton`; `<ClearQueryParams params={["error"]} />` rendered when an error was shown.

```tsx
import Link from "next/link";
import ClearQueryParams from "./ClearQueryParams";
import DetailsPopover from "./DetailsPopover";
import PasswordForm from "./PasswordForm";
import SubmitButton from "./SubmitButton";
import { createGroupAction, signOutAction, updateNameAction } from "./actions";
import { requireMember } from "../lib/auth/server";
import { getPool } from "../lib/db/pool";
import { listGroupsForMember } from "../lib/db/queries";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await requireMember();
  const groups = await listGroupsForMember(getPool(), me.id);
  const { error } = await searchParams;

  return (
    <main>
      {error && <ClearQueryParams params={["error"]} />}
      <div className="topbar">
        <span className="wordmark">Verdict</span>
        <nav>
          <Link href="/search">Search</Link> ·{" "}
          <DetailsPopover summary={me.name} title="Change your display name">
            <form action={updateNameAction} className="card">
              <label htmlFor="display-name">Display name</label>
              <input
                id="display-name"
                name="name"
                type="text"
                defaultValue={me.name}
                maxLength={80}
                required
              />
              <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
            </form>
          </DetailsPopover>{" "}
          ·{" "}
          <PasswordForm />{" "}
          ·{" "}
          <form action={signOutAction} style={{ display: "inline" }}>
            <SubmitButton
              className="quiet"
              style={{ margin: 0, padding: "0.1rem 0.5rem", fontSize: "0.85rem" }}
              pendingLabel="Signing out…"
            >
              Sign out
            </SubmitButton>
          </form>
        </nav>
      </div>

      <h1>Your groups</h1>
      {groups.length === 0 && (
        <p className="muted">No groups yet. Start one, then add your friends by email.</p>
      )}
      {groups.map((g) => (
        <div className="card" key={g.id}>
          <h3>
            <Link className="card-link" href={`/g/${g.id}`}>
              {g.name}
            </Link>
          </h3>
          <p className="small muted">
            {g.member_count} members ·{" "}
            {g.open_polls > 0 ? (
              <span style={{ color: "var(--orange)" }}>{g.open_polls} open case{g.open_polls > 1 ? "s" : ""}</span>
            ) : (
              "no open cases"
            )}{" "}
            · {g.record_count} sealed verdict{g.record_count === 1 ? "" : "s"}
          </p>
        </div>
      ))}

      <div className="card" style={{ marginTop: "2rem" }}>
        <h3>Start a group</h3>
        <form action={createGroupAction}>
          <label htmlFor="name">Group name</label>
          <input id="name" name="name" type="text" placeholder="College Friends" required />
          <SubmitButton pendingLabel="Creating…">Create group</SubmitButton>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify + commit**

Run: `pnpm typecheck` — exit 0.

```bash
git add src/app/page.tsx src/app/PasswordForm.tsx
git commit -m "feat(ui): home page card links, pending buttons, closing popovers"
```

---

### Task 5: Group + poll pages — card links, add-member notice, option rows

**Files:**
- Modify: `src/app/actions.ts:34-52` (`addMemberByEmailAction`)
- Modify: `src/app/g/[groupId]/page.tsx`
- Modify: `src/app/g/[groupId]/p/[pollId]/page.tsx`

**Interfaces:**
- Consumes: `SubmitButton`, `ClearQueryParams`, `.card-link`, `label.option-row`.
- Produces: `addMemberByEmailAction` now redirects to `/g/<id>?added=<name>` on success; the group page reads `searchParams.added`.

- [ ] **Step 1: `addMemberByEmailAction` returns the added member's name**

Replace the function in `src/app/actions.ts`:

```ts
export async function addMemberByEmailAction(groupId: string, formData: FormData): Promise<void> {
  const me = await requireMember();
  const path = `/g/${groupId}`;
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  let addedName: string;
  try {
    if (!(await isGroupMember(getPool(), groupId, me.id))) throw new Error("not your group");
    const found = await getPool().query("select id, name from members where lower(email) = $1", [email]);
    if (found.rows.length === 0) {
      throw new Error(`${email} hasn't signed in to Verdict yet — ask them to sign in once first`);
    }
    await addGroupMember(getPool(), { group_id: groupId, member_id: found.rows[0].id });
    addedName = found.rows[0].name;
  } catch (err) {
    backWithError(path, err);
  }
  revalidatePath(path);
  redirect(`${path}?added=${encodeURIComponent(addedName)}`);
}
```

- [ ] **Step 2: Group page — poll card links, notice, pending buttons**

In `src/app/g/[groupId]/page.tsx`:

1. Add imports: `import ClearQueryParams from "../../ClearQueryParams";` and `import SubmitButton from "../../SubmitButton";`
2. Widen searchParams: `searchParams: Promise<{ error?: string; added?: string }>;` and destructure `const { error, added } = await searchParams;`
3. At the top of `<main>`: `{(error || added) && <ClearQueryParams params={["error", "added"]} />}`
4. Poll title link becomes `<Link className="card-link" href={...}>` (the sealed cards' "read the verdict" link needs no change — Task 2's CSS raises non-`.card-link` anchors).
5. In the add-member card, after the form:

```tsx
{added && <p className="notice">{added} added to the group.</p>}
{error && <p className="error">{error}</p>}
```

6. The add-member submit becomes:

```tsx
<SubmitButton pendingLabel="Adding…">Add to {group.name}</SubmitButton>
```

- [ ] **Step 3: Poll page — label option rows, pending buttons**

In `src/app/g/[groupId]/p/[pollId]/page.tsx`:

1. Add imports: `import ClearQueryParams from "../../../../ClearQueryParams";` and `import SubmitButton from "../../../../SubmitButton";`
2. At the top of `<main>`: `{error && <ClearQueryParams params={["error"]} />}`
3. Vote options — replace the `.option-row` div block:

```tsx
{poll.options.map((o) => (
  <label className="option-row" key={o.id}>
    <input
      type="radio"
      name="option_id"
      value={o.id}
      defaultChecked={poll.my_vote?.option_id === o.id}
      required
    />
    <span>{o.label}</span>
  </label>
))}
```

(The `id`/`htmlFor` pair is no longer needed — the label wraps its input.)

4. Vote submit: `<SubmitButton pendingLabel="Recording…">{poll.my_vote ? "Change vote" : "Cast vote"}</SubmitButton>`
5. Remove-participant button: `<SubmitButton className="quiet" style={{ margin: 0, padding: "0.15rem 0.5rem" }} pendingLabel="…">remove</SubmitButton>`
6. Add-participant button: `<SubmitButton className="quiet" pendingLabel="Adding…">Add participant</SubmitButton>`
7. Withdraw button: `<SubmitButton className="danger" pendingLabel="Withdrawing…">Withdraw this case</SubmitButton>`

- [ ] **Step 4: Verify + commit**

Run: `pnpm typecheck` — exit 0.

```bash
git add src/app/actions.ts "src/app/g/[groupId]/page.tsx" "src/app/g/[groupId]/p/[pollId]/page.tsx"
git commit -m "feat(ui): group/poll card links, add-member notice, clickable option rows"
```

---

### Task 6: New-poll, ledger, and search pages

**Files:**
- Modify: `src/app/g/[groupId]/polls/new/page.tsx`
- Modify: `src/app/g/[groupId]/records/page.tsx`
- Modify: `src/app/search/page.tsx`

**Interfaces:**
- Consumes: `SubmitButton`, `ClearQueryParams`, `.card-link`.

- [ ] **Step 1: New-poll page**

In `src/app/g/[groupId]/polls/new/page.tsx`:

1. Imports: `import ClearQueryParams from "../../../../ClearQueryParams";` and `import SubmitButton from "../../../../SubmitButton";`
2. Top of `<main>`: `{error && <ClearQueryParams params={["error"]} />}`
3. Submit: `<SubmitButton pendingLabel="Opening…">Open the case</SubmitButton>`

- [ ] **Step 2: Ledger page**

In `src/app/g/[groupId]/records/page.tsx`, the record title link becomes:

```tsx
<Link className="card-link" href={`/g/${groupId}/records/${r.seq}`}>{r.title}</Link>
```

- [ ] **Step 3: Search page**

In `src/app/search/page.tsx`:

1. Result title link becomes `<Link className="card-link" href={...}>{h.title}</Link>`
2. The search form is a GET form (no server action, `useFormStatus` won't fire) — leave its plain `<button type="submit">` as is.

- [ ] **Step 4: Verify + commit**

Run: `pnpm typecheck` — exit 0.

```bash
git add "src/app/g/[groupId]/polls/new/page.tsx" "src/app/g/[groupId]/records/page.tsx" src/app/search/page.tsx
git commit -m "feat(ui): pending state on poll creation; ledger/search card links"
```

---

### Task 7: Supabase config + end-to-end verification

**Files:** none (config + verification only)

- [ ] **Step 1: Turn off email confirmation (dashboard — user action or Supabase MCP)**

Supabase dashboard → project → **Authentication → Sign In / Providers → Email** → toggle **"Confirm email" OFF** → Save. (Leave "Time-box user sessions" and "Inactivity timeout" disabled, per the 2026-07-09 spec.)

- [ ] **Step 2: Unblock previously-unconfirmed accounts**

In the Supabase SQL editor, check for stuck accounts:

```sql
select id, email, created_at from auth.users where email_confirmed_at is null;
```

If any friends are listed and still can't sign in after the toggle, confirm them manually:

```sql
update auth.users set email_confirmed_at = now() where email_confirmed_at is null;
```

- [ ] **Step 3: Build + tests**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: all pass (DB tests auto-skip without `DATABASE_URL`).

- [ ] **Step 4: Live click-through (dev server + Chrome DevTools)**

Run `pnpm dev`, then verify at desktop and 390px-wide viewports:

1. `/login` → Create account with a fresh email + password → lands signed-in on `/` with **zero emails sent**.
2. Home: click a group card's empty area → navigates; create a group, double-clicking the submit → exactly one group.
3. Group: click poll card body → navigates; on a sealed poll card, "read the verdict" still works independently; add a member → green notice appears → refresh → notice gone and `?added` absent from URL.
4. Poll: click an option row's padding → radio selects; cast vote → button shows "Recording…" once.
5. Topbar: open the name editor, click elsewhere → it closes; repeat for Password.
6. 390px viewport: no horizontal scroll on `/`, `/login`, group, poll pages; topbar wraps cleanly.

- [ ] **Step 5: Push + production check (confirm with user before pushing to main)**

```bash
git push origin main
```

After the Vercel deploy: one real signup on https://verdict.deviloper.dev.
