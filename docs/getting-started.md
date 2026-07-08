# Getting Started with Verdict

This walks you from a fresh clone to a deployed app your friends can use. The short version lives in the [README](../README.md); this is the long version with every click.

**What you'll end up with:** a web app where your group opens "cases" (debates), everyone required votes with written reasoning, and the conclusion seals itself into a hash-chained ledger that nobody — including you, the host — can silently rewrite. All on free tiers.

---

## 1. Local development (no accounts needed)

Prerequisites: Node 20+ (WebCrypto is used for hashing), pnpm.

```bash
git clone <this-repo> && cd Verdict
pnpm install
pnpm test        # chain-library tests — run with no database at all
pnpm typecheck
pnpm build
```

That already exercises the core guarantee: canonical hashing, chain verification, and every tamper-detection path.

### Running the DB tests

Any Postgres 14+ works. Two options:

**Option A — Supabase local stack** (closest to production; needs Docker):

```bash
brew install supabase/tap/supabase
supabase start                     # boots Postgres 15 + pgvector + Auth
supabase db reset                  # applies supabase/migrations/ in order
PGVECTOR_TESTS=1 DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm test
```

**Option B — plain Postgres** (e.g. Homebrew, no Docker):

```bash
# vanilla PG has no Supabase auth schema — apply the test-only stub FIRST
psql "$DATABASE_URL" -f tests/db/vanilla-pg-auth-stub.sql
psql "$DATABASE_URL" -f supabase/migrations/00001_core_schema.sql \
                     -f supabase/migrations/00002_records_append_only.sql \
                     -f supabase/migrations/00003_rls_policies.sql
# 00004 (semantic search) needs the pgvector extension — skip it if you don't have it
DATABASE_URL=... pnpm test
```

Expected: ~60 tests green. The pgvector search test only runs when `PGVECTOR_TESTS=1` is set.

### Running the app locally

The app needs a Supabase project for sign-in (magic links have to come from somewhere). Easiest path: create the cloud project (step 2), then:

```bash
cp .env.example .env.local   # fill in the values
pnpm dev                     # http://localhost:3000
```

Add `http://localhost:3000/auth/callback` to Supabase Auth → URL Configuration → Redirect URLs so magic links work locally too.

---

## 2. Create the Supabase project

1. [supabase.com](https://supabase.com) → New project (free tier). Pick a strong DB password — it goes into `DATABASE_URL`.
2. **SQL Editor** → run each file from `supabase/migrations/` **in order** (00001 → 00004). Do *not* run anything from `tests/` — the auth stub is for vanilla Postgres only.
3. **Authentication → Providers**: Email (magic link) is on by default; enable Google if you want one-click sign-in (needs a Google OAuth client).
4. Collect your values: Project Settings → API (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) and → Database (`DATABASE_URL`).

## 3. Push to GitHub

```bash
git remote add origin git@github.com:YOU/verdict.git
git push -u origin main
```

A **public** repo makes the anchor maximally trustworthy (anyone can see the commit history); a private repo still works — your friends just need read access to independently check anchors.

## 4. Deploy on Vercel

1. [vercel.com](https://vercel.com) → Add New Project → import the repo. Framework auto-detects as Next.js.
2. Environment variables: everything from `.env.example` except `ANCHOR_RAW_BASE_URL` (add it after step 5). Generate the token with `openssl rand -hex 32`.
3. Deploy, note your URL (e.g. `https://verdict-yogi.vercel.app`).
4. Back in Supabase: Auth → URL Configuration → add `https://verdict-yogi.vercel.app/auth/callback` to Redirect URLs and set the Site URL.

Sign in with your own email — the magic link should land you on "Your groups".

## 5. Turn on anchoring (the "even I can't tamper" switch)

1. GitHub repo → Settings → Secrets and variables → Actions → add:
   - `APP_URL` = your Vercel URL
   - `ANCHOR_EXPORT_TOKEN` = same value as in Vercel
2. Actions tab → `anchor-chain` → **Run workflow** (it also runs itself every 6 hours). After the first sealed record exists, it commits `anchors/<group_id>/latest.json` + `export.json`.
3. Add `ANCHOR_RAW_BASE_URL=https://raw.githubusercontent.com/YOU/verdict/main` to Vercel env and redeploy.

From then on the Verify page shows *"✓ Matches the public anchor"* — the full guarantee is live.

*(Optional)* Schedule embedding retries the same way: a cron hitting `GET $APP_URL/api/embed-pending` with `Authorization: Bearer $ANCHOR_EXPORT_TOKEN` sweeps up embeddings missed during OpenAI outages.

## 6. First run with your group

1. You sign in → **Start a group**.
2. Each friend signs in once (that creates their account) → you add them by email on the group page.
3. Someone opens a case: title, context, 2+ options, quorum, participants (defaults to everyone).
4. Everyone votes — an option **plus written reasoning**, changeable until sealing. Votes stay hidden while the case is open.
5. When quorum is met and one option leads outright, the case seals itself and everyone can read the verdict — opinions and all — forever.
6. Anyone can hit **Verify chain** at any time. Suspicion is a feature: the whole point is that trust is checkable.

## Where things live

| | |
|---|---|
| Product spec | `docs/verdict-prd.md` |
| Milestone plans (all complete) | `docs/superpowers/plans/` |
| Chain library (isomorphic hash + verify) | `src/lib/chain/` |
| Domain services (groups/polls/votes/finalize) | `src/lib/db/` |
| Semantic search | `src/lib/search/` |
| Export/anchoring | `src/lib/anchor/`, `.github/workflows/anchor.yml` |
| Migrations | `supabase/migrations/` |
| Disaster recovery | README §"Restore from export" + `tests/db/anchor.test.ts` |
