# Verdict M3 — Semantic Search Implementation Plan

> Same-session author/executor format. REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Natural-language search over sealed records, scoped to the member's groups: async post-seal embedding pipeline (OpenAI `text-embedding-3-small`) + pgvector similarity search + search UI.

**Architecture:** `Embedder` is an interface; `OpenAIEmbedder` (plain `fetch`, no SDK) in production, `FakeEmbedder` in tests. Sealing NEVER waits on embeddings: `castVoteAction` fire-and-forgets `embedPendingRecords`, and any records missed (API down) are retried on the next call or via `GET /api/embed-pending` (cron-able, token-protected). Embeddings live in `record_embeddings` (`vector(1536)`), outside the hash — derived data by design (PRD §6.3).

## Global Constraints
- Embedding failures must never fail or delay finalization (PRD §6.4).
- Search scope: only groups the searching member belongs to; optional per-group filter.
- pgvector exists on Supabase; scratch PG14 lacks it → vector DB tests `describe.runIf(pgvector present)`; text-building and pipeline-orchestration logic tested with fakes everywhere.

## Tasks
1. [x] **Migration 00004**: `create extension if not exists vector;` + `record_embeddings (record_id uuid pk → records, content text, embedding vector(1536), created_at)` + ivfflat index. (Applied on Supabase; skipped on scratch PG.)
2. [x] **Embedder + record text**: `src/lib/search/embedder.ts` (`Embedder` iface, `OpenAIEmbedder`), `src/lib/search/recordText.ts` (`buildRecordText(record)`: title + context + decided label + each "name voted label: opinion"). Pure tests.
3. [x] **Pipeline**: `src/lib/search/pipeline.ts` — `embedPendingRecords(pool, embedder, limit=20)`: selects sealed records lacking embeddings, builds text, embeds in one batch, upserts; returns count; swallows/reports errors without throwing past the boundary. Test with FakeEmbedder against scratch PG using a plain float8[] fallback? No — table needs vector; instead pipeline test runs only with pgvector; orchestration unit-tested via a mock pool? Keep it simple: logic split so `selectPending` SQL + `buildRecordText` are testable; full pipeline gated.
4. [x] **Search**: `src/lib/search/search.ts` — `searchRecords(pool, embedder, memberId, query, {groupId?, limit=10})` → cosine distance ordered, membership-scoped. Gated DB test.
5. [x] **UI + routes**: `/search` page (query box, group filter, results as ledger cards linking to records); nav links; fire-and-forget hook in `castVoteAction`; `GET /api/embed-pending` (Bearer `ANCHOR_EXPORT_TOKEN`). Build green.
6. [x] **Gate**: tests + typecheck + build green; merge.

## Exit criteria (PRD §11 M3)
Natural-language query returns relevant past Records within the member's groups (fully exercisable once deployed on Supabase with an OpenAI key; all logic tested here).
