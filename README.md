# Verdict

**Settle it once.** A group of friends debates; when the required participants have voted (each with mandatory written reasoning) and one option leads outright, the conclusion is sealed into an append-only, hash-chained ledger that nobody — including the person hosting it — can silently rewrite. Semantic search answers "what did we decide about…" months later.

PRD: [`docs/verdict-prd.md`](docs/verdict-prd.md) (v1.1). Implementation plans: `docs/superpowers/plans/`.

## How the tamper-evidence works (three layers)

1. **Postgres enforcement** — the `records` table has an INSERT-only role and a trigger that blocks UPDATE/DELETE. Stops bugs and casual meddling.
2. **Hash chain** — each record stores `SHA256(canonical JSON of its contents + prev_hash)` with a per-group sequence number. Any edit breaks every later link; any deletion leaves a seq gap. Verification runs **in each member's browser** (same isomorphic library the server seals with) — you check the math, not the server's word.
3. **Public anchoring** — a scheduled GitHub Action commits each chain's head hash + a full export to this repo. A malicious DB owner can rewrite a whole chain suffix self-consistently, but not the copy in the public commit history. The export doubles as the backup (see restore below).

## Stack

Next.js (App Router) + TypeScript · Supabase (Postgres, Auth, RLS, pgvector) · OpenAI `text-embedding-3-small` (async, post-seal) · Vercel · GitHub Actions.

## Development

```bash
pnpm install
pnpm test        # chain-library tests run with no DB
pnpm typecheck
pnpm build
```

DB-backed tests need any Postgres 14+ with the migrations applied:

```bash
# vanilla Postgres: apply the test-only auth stub BEFORE migration 00003
psql "$DATABASE_URL" -f tests/db/vanilla-pg-auth-stub.sql
psql "$DATABASE_URL" -f supabase/migrations/00001_core_schema.sql \
                     -f supabase/migrations/00002_records_append_only.sql \
                     -f supabase/migrations/00003_rls_policies.sql
# 00004 needs pgvector (Supabase has it built in)
DATABASE_URL=postgresql://... pnpm test
# with pgvector available, also: PGVECTOR_TESTS=1 DATABASE_URL=... pnpm test
```

## Production setup

1. **Supabase**: create a project → SQL editor: run `supabase/migrations/*.sql` in order (skip the test stub). Enable Email (magic link) and Google providers under Auth.
2. **Vercel**: import this repo; set env vars from `.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`, `OPENAI_API_KEY`, `ANCHOR_EXPORT_TOKEN`, and later `ANCHOR_RAW_BASE_URL`). Add your Vercel URL to Supabase Auth → Redirect URLs (`https://your-app.vercel.app/auth/callback`).
3. **Anchoring**: in this GitHub repo add secrets `APP_URL` and `ANCHOR_EXPORT_TOKEN` (same as Vercel). The `anchor-chain` workflow then commits `anchors/<group_id>/latest.json` + `export.json` every 6 hours. Set `ANCHOR_RAW_BASE_URL=https://raw.githubusercontent.com/<you>/<repo>/main` in Vercel so the Verify page checks against the public anchor.
4. **Embedding retries** (optional): schedule `GET $APP_URL/api/embed-pending` with `Authorization: Bearer $ANCHOR_EXPORT_TOKEN` (e.g. a second GitHub Action cron) to sweep any embeddings missed while OpenAI was down.

## Restore from export (disaster recovery)

`anchors/<group_id>/export.json` contains every sealed record. Recreate the schema, then insert each record row verbatim (see the worked example in `tests/db/anchor.test.ts`, "restore-from-export"). Run Verify afterwards — the chain must pass against the last committed anchor.

## Verifying without trusting anyone

Any member: open the group → **Verify chain**. The browser downloads raw records, recomputes every SHA-256 over RFC 8785 canonical JSON, walks the chain links, checks seq continuity, and compares the head against the public anchor commit. A clean result means: nothing edited, nothing deleted, nothing truncated — since the last anchor, not even by the admin.
