# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Verdict is

A group decides something via a poll; when quorum is met and one option leads outright, the result is **sealed** into an append-only, hash-chained ledger that nobody (including the DB owner) can silently rewrite. Spec: `docs/verdict-prd.md` (v1.1). Milestone implementation plans (M0–M4, all complete): `docs/superpowers/plans/`.

## Commands

```bash
pnpm install
pnpm dev                              # Next.js dev server
pnpm test                             # vitest run — chain tests need no DB; DB tests auto-skip without DATABASE_URL
pnpm test tests/chain/hash.test.ts    # single test file
pnpm typecheck
pnpm build
```

DB-backed tests (`tests/db/`) need Postgres 14+ with migrations applied:

```bash
# vanilla Postgres only: apply tests/db/vanilla-pg-auth-stub.sql BEFORE migration 00003
psql "$DATABASE_URL" -f supabase/migrations/00001_core_schema.sql \
                     -f supabase/migrations/00002_records_append_only.sql \
                     -f supabase/migrations/00003_rls_policies.sql
DATABASE_URL=postgresql://... pnpm test
PGVECTOR_TESTS=1 DATABASE_URL=... pnpm test   # also run pgvector search tests (needs migration 00004)
```

DB test files share one database and truncate between tests — `vitest.config.ts` sets `fileParallelism: false`; never re-enable parallelism.

## Architecture

Next.js App Router + TypeScript · Supabase (Postgres, Auth, RLS, pgvector) · OpenAI `text-embedding-3-small` · Vercel · GitHub Actions. Env vars documented in `.env.example`.

### Three tamper-evidence layers (the core design)

1. **Postgres enforcement** — `records` is append-only: a trigger blocks UPDATE/DELETE (`supabase/migrations/00002`).
2. **Hash chain** — each record stores `SHA256(canonical JSON of hashed fields incl. prev_hash)` with a per-group `seq`. Genesis link is `sha256("verdict-genesis:<group_id>")`.
3. **Public anchoring** — `.github/workflows/anchor.yml` hits `/api/anchor-export` (bearer `ANCHOR_EXPORT_TOKEN`) every 6h and commits `anchors/<group_id>/latest.json` + `export.json` to this repo. The export is also the disaster-recovery backup (restore example: `tests/db/anchor.test.ts` "restore-from-export").

### The chain library — `src/lib/chain/`

Isomorphic (runs in browser on the Verify page and on the server when sealing) — uses only `globalThis.crypto.subtle`, no Node imports. Rules that must not be broken:

- `canonical.ts` is RFC 8785 canonical JSON, **deliberately rejecting floats** — don't "fix" that.
- `hash.ts` defines `HASHED_FIELDS` and `HASH_VERSION`. Any change to what's hashed or how requires bumping `HASH_VERSION` and keeping the old computation for existing records.
- Hashes are computed over **exact string shapes**. Timestamps in snapshots are formatted in SQL with `to_char(... 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')` and re-read as strings for verification (see `tests/db/setup.ts` `loadStoredChain`). Changing a timestamp format, JSON key, or array order breaks verification of existing chains.
- Snapshot arrays are sorted deterministically (by id / member_id / participant_id) in `appendRecordTx` before hashing.

### Write path — `src/lib/db/`

Server-side DB access uses a raw `pg` pool (`pool.ts`), **not** the Supabase client; Supabase is used for Auth (`src/lib/auth/`, `@supabase/ssr`) and RLS covers browser reads. Concurrency discipline:

- All appends/finalizations serialize on a per-group advisory lock: `pg_advisory_xact_lock(hashtext(group_id))`, taken inside the transaction. `UNIQUE(group_id, seq)` is the backstop.
- `castVote` (`votes.ts`) casts the vote and calls `checkAndFinalize` (`finalize.ts`) **in the same transaction**, so quorum check + sealing are atomic against concurrent votes. It re-reads poll status under the lock.
- Quorum uses integer math (`votes * 100 >= quorum_percent * participants`); a tie for first place keeps the poll open (strict plurality required). Opinions are mandatory — empty opinion is rejected.

### Request flow

- `src/proxy.ts` — auth gate (Next.js proxy/middleware): refreshes the Supabase session cookie, redirects unauthenticated users to `/login`. Skips gracefully when Supabase env vars are unset (local unconfigured builds must still compile).
- `src/app/actions.ts` — all mutations are server actions; errors surface by redirecting back with `?error=<message>` (`backWithError`), not by throwing.
- Pages live under `src/app/g/[groupId]/` (group, poll, records, verify). The Verify page fetches raw records from `verify/data/route.ts` and recomputes the whole chain client-side, comparing the head against the public anchor (`ANCHOR_RAW_BASE_URL`).

### Semantic search — `src/lib/search/`

Embedding happens **after** sealing and must never affect finalization: `embedPendingRecords` (`pipeline.ts`) swallows embedder failures by design. It processes all records lacking embeddings, so re-running it IS the retry mechanism (`/api/embed-pending`, same bearer token). Search queries pgvector (`search.ts`); UI at `/search`.

## UI

Dark theme with pastel blue/violet/orange/green accents; plain CSS in `src/app/globals.css` (no Tailwind/component library).
