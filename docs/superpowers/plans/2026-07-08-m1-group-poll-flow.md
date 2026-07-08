# Verdict M1 — Group & Poll Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> *Format note: this plan is executed by its author in the same session, so task steps reference interfaces + test intent rather than inlining every code block; the committed code is the canonical detail.*

**Goal:** The full poll lifecycle as a tested domain layer: groups/membership, poll creation with participant rules, voting with mandatory opinions, and quorum + strict-winner finalization that seals via the M0 chain primitive. Plus production RLS policies.

**Architecture:** Plain server-side TypeScript modules in `src/lib/db/` operating on `pg` (no HTTP layer yet — M2 wraps these in Next.js route handlers). Every state-changing poll operation runs in one transaction holding the per-group advisory lock, so vote-cast and finalization are atomic. `appendRecord` is refactored to expose a client-scoped `appendRecordTx` reused by finalization.

**Tech Stack:** unchanged from M0. Members' `id` doubles as the Supabase Auth user id in production (M2 wires signup to insert the member row).

## Global Constraints

- PRD v1.1 rules: quorum per poll; vote = option + non-blank opinion; vote changeable while open; **participant adds until finalization, removals only before first vote, creator-only**; tie at quorum → stays open; withdraw creator-only while open; finalized = sealed via chain.
- Timestamps inside snapshots are ISO 8601 UTC strings formatted `YYYY-MM-DDTHH:MM:SS.mmmZ` (matches `Date.toISOString()` and `to_char(... 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`), so hashed bytes equal reloaded bytes.
- All DB tests gated on `DATABASE_URL` as in M0.

## Tasks

### Task 1: Refactor appendRecord → appendRecordTx
- Modify: `src/lib/db/appendRecord.ts`
- Produces: `appendRecordTx(client: PoolClient, input: NewRecordInput): Promise<StoredRecord>` (no begin/commit — caller owns tx; still takes the advisory lock, which is idempotent within a tx) and `appendRecord(pool, input)` as a thin wrapper. M0 tests must stay green.
- [ ] Refactor, run `DATABASE_URL=... pnpm test`, commit.

### Task 2: Groups & membership service
- Create: `src/lib/db/groups.ts`, `tests/db/groups.test.ts`
- Produces: `createGroup(pool, {name, created_by}): Promise<{id}>` (creator auto-joins), `addGroupMember(pool, {group_id, member_id}): Promise<void>`, `listGroupMembers(pool, group_id): Promise<{member_id, name}[]>`.
- Tests: creator becomes member; duplicate membership rejected; non-member listing.
- [ ] TDD cycle + commit.

### Task 3: Poll creation & participant rules
- Create: `src/lib/db/polls.ts`, `tests/db/polls.test.ts`
- Produces:
  - `createPoll(pool, {group_id, created_by, title, context?, quorum_percent, option_labels, participant_member_ids?}): Promise<PollDetail>` — ≥2 options enforced; participants default to all group members; all participants must be group members; creator must be a group member.
  - `addParticipant(pool, {poll_id, member_id, actor_id})` — creator-only, poll open, member of group.
  - `removeParticipant(pool, {poll_id, member_id, actor_id})` — creator-only, poll open, **zero votes cast on the poll**.
  - `withdrawPoll(pool, {poll_id, actor_id})` — creator-only, poll open → status `withdrawn`.
- Tests: defaults, validation failures, add allowed after votes exist, remove blocked after first vote, withdraw rules.
- [ ] TDD cycle + commit.

### Task 4: Voting + finalization
- Create: `src/lib/db/votes.ts`, `src/lib/db/finalize.ts`, `tests/db/votes.test.ts`
- Produces:
  - `castVote(pool, {poll_id, member_id, option_id, opinion}): Promise<{finalized: boolean; record?: StoredRecord}>` — participant-only, open poll, non-blank opinion, option belongs to poll; re-vote replaces prior vote; runs finalization check in the same tx.
  - `checkAndFinalize(client, poll_id): Promise<StoredRecord | null>` — quorum via integer math (`votes*100 >= quorum*participants`), strict-plurality winner required; on seal: snapshots (options/participants+names/votes, deterministically ordered), `appendRecordTx`, poll status → `finalized`.
- Tests: non-participant rejected; blank opinion rejected; vote change while open; quorum-not-met stays open; **tie at quorum stays open**; tie broken by re-vote → finalizes; sealed chain passes `verifyChain`; votes after finalization rejected; participant-add mid-vote raises denominator (un-finalizes nothing, just delays).
- [ ] TDD cycle + commit.

### Task 5: RLS policies (production) + stub-auth test
- Create: `supabase/migrations/00003_rls_policies.sql`, `tests/db/rls.test.ts`
- Produces: RLS enabled on all tables; policies scoping SELECT/INSERT/UPDATE by group membership via `auth.uid()` (= `members.id`). Test creates a stub `auth.uid()` (reads `request.jwt.claim.sub` GUC) + non-superuser role in vanilla PG to prove: member sees own group's records, not another group's.
- [ ] TDD cycle + commit.

### Task 6: Merge gate
- [ ] Full suite green with DB (`DATABASE_URL=... pnpm test`), typecheck green, merge to main.

## Exit criteria (PRD §11 M1)
A poll can be created → participants selected → voted (mandatory opinions) → auto-finalized end-to-end into a verified chain record, including tie-stays-open behavior and participant add/remove rules.
