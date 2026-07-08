# Verdict M0 — Integrity Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Verdict's tamper-evidence foundation: canonical hashing, per-group hash chain with sequence numbers, append-only Postgres ledger, and an isomorphic verification library whose tests prove that edits, deletions, and truncation are all detected.

**Architecture:** A pure-TypeScript chain library (`src/lib/chain/`) with zero Node-only dependencies (WebCrypto + hand-rolled canonical JSON) so the exact same code seals records on the server and verifies them in the browser. Postgres migrations create the schema, an INSERT-only role, and a mutation-blocking trigger on `records`. A server-side `appendRecord` helper does advisory-lock + seq + hash + insert atomically.

**Tech Stack:** TypeScript (strict, ESM), Vitest, `pg`, Supabase-style SQL migrations in `supabase/migrations/`. (Next.js is added in M2 — not needed for M0. No canonicalization dependency: our field types are integers/strings/arrays/objects only, so a ~20-line key-sorting serializer is fully RFC 8785-compliant for our domain.)

## Global Constraints

- Spec: `docs/verdict-prd.md` v1.1. Hash contract (§6.3): `this_hash = SHA256(canonicalJSON({seq, group_id, poll_id, title, context, options, participants, votes, winning_option_id, quorum_percent, finalized_at, prev_hash, hash_version}))`, `hash_version = 1`.
- Genesis: `prev_hash = SHA256("verdict-genesis:" + group_id)`.
- `seq` per-group monotonic from 1, `UNIQUE(group_id, seq)`.
- The chain library must be isomorphic: no `node:` imports, only `globalThis.crypto.subtle` + `TextEncoder`.
- Package manager: pnpm. `package.json` has `"type": "module"`.
- The PRD ER diagram's `content_snapshot` is realized as two columns, `title` + `context`, matching the §6.3 hash field list.
- DB integration tests are gated: `describe.runIf(!!process.env.DATABASE_URL)` — they run only when a local Postgres/Supabase is up (needs Docker + Supabase CLI: `supabase start`, then `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm test`).
- RLS note: M0 enables RLS on `records` (deny-by-default). Member-scoped policies land in M1 when Supabase Auth exists — there is no `auth.uid()` to write policies against yet.

## File Structure

```
package.json, tsconfig.json, vitest.config.ts, .gitignore
src/lib/chain/canonical.ts     — canonicalJson(): RFC 8785-compliant serializer (integer-only numbers)
src/lib/chain/types.ts         — RecordFields, StoredRecord, AnchorPoint, VerifyResult, ChainFailure
src/lib/chain/hash.ts          — sha256Hex, genesisHash, computeRecordHash, HASH_VERSION
src/lib/chain/verify.ts        — verifyChain()
src/lib/chain/index.ts         — public re-exports
src/lib/db/appendRecord.ts     — advisory-lock append (server-only, uses pg)
supabase/migrations/00001_core_schema.sql
supabase/migrations/00002_records_append_only.sql
tests/chain/canonical.test.ts, tests/chain/hash.test.ts, tests/chain/verify.test.ts
tests/chain/helpers.ts         — buildChain() fixture builder
tests/db/setup.ts              — pg Pool + truncate helper
tests/db/append.test.ts        — schema, append-only, concurrency, tamper-detection tests
```

---

### Task 1: Project scaffold + Vitest

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `tests/chain/canonical.test.ts` (first real test lands here in Task 2; scaffold verifies the runner)

**Interfaces:**
- Produces: a repo where `pnpm test` runs Vitest over `tests/**/*.test.ts`.

- [ ] **Step 1: Init package and install dev tooling**

```bash
pnpm init
pnpm add -D typescript vitest @types/node
pnpm add pg
pnpm add -D @types/pg
```

- [ ] **Step 2: Write config files**

`package.json` — ensure these keys (keep pnpm's generated fields):

```json
{
  "name": "verdict",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "tests"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"] },
});
```

`.gitignore`:

```
node_modules/
.env
.env.*
supabase/.temp/
```

- [ ] **Step 3: Verify the runner works**

Run: `pnpm test`
Expected: Vitest exits cleanly reporting no test files found (or 0 tests) — the runner itself must start without config errors. `pnpm typecheck` passes.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vitest.config.ts .gitignore
git commit -m "chore: scaffold TypeScript + Vitest project"
```

---

### Task 2: Canonical JSON + record hashing

**Files:**
- Create: `src/lib/chain/canonical.ts`, `src/lib/chain/types.ts`, `src/lib/chain/hash.ts`, `src/lib/chain/index.ts`
- Test: `tests/chain/canonical.test.ts`, `tests/chain/hash.test.ts`

**Interfaces:**
- Produces:
  - `canonicalJson(value: unknown): string` — throws on floats/NaN/undefined/functions.
  - `sha256Hex(input: string): Promise<string>`
  - `genesisHash(groupId: string): Promise<string>`
  - `computeRecordHash(fields: RecordFields): Promise<string>` — hashes exactly the 13 contract fields, ignores extras.
  - `HASH_VERSION = 1`
  - Types: `RecordFields`, `RecordOption {id,label}`, `RecordParticipant {member_id,name,added_at}`, `RecordVote {participant_id,option_id,opinion,voted_at}`, `StoredRecord = RecordFields & {this_hash: string}`.

- [ ] **Step 1: Write failing tests**

`tests/chain/canonical.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../src/lib/chain/canonical";

describe("canonicalJson", () => {
  it("sorts object keys lexicographically at every depth", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("is byte-identical regardless of insertion order", () => {
    const x = { title: "t", seq: 1, votes: [{ b: "2", a: "1" }] };
    const y = { votes: [{ a: "1", b: "2" }], seq: 1, title: "t" };
    expect(canonicalJson(x)).toBe(canonicalJson(y));
  });

  it("preserves array order (arrays are significant)", () => {
    expect(canonicalJson([2, 1])).toBe("[2,1]");
  });

  it("escapes strings per JSON rules", () => {
    expect(canonicalJson({ s: 'a"b\n' })).toBe('{"s":"a\\"b\\n"}');
  });

  it("rejects non-integer numbers (out of our JCS-safe subset)", () => {
    expect(() => canonicalJson({ x: 1.5 })).toThrow(/integer/);
    expect(() => canonicalJson({ x: NaN })).toThrow(/integer/);
  });

  it("rejects undefined and functions", () => {
    expect(() => canonicalJson(undefined)).toThrow();
    expect(() => canonicalJson({ f: () => 1 })).toThrow();
  });
});
```

`tests/chain/hash.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeRecordHash, genesisHash, sha256Hex, HASH_VERSION } from "../../src/lib/chain/hash";
import type { RecordFields } from "../../src/lib/chain/types";

const baseFields: RecordFields = {
  seq: 1,
  group_id: "g-1",
  poll_id: "p-1",
  title: "Split rent how?",
  context: "March flat debate",
  options: [
    { id: "o1", label: "By headcount" },
    { id: "o2", label: "By room size" },
  ],
  participants: [{ member_id: "m1", name: "Yogi", added_at: "2026-07-08T00:00:00Z" }],
  votes: [{ participant_id: "pt1", option_id: "o1", opinion: "simpler", voted_at: "2026-07-08T01:00:00Z" }],
  winning_option_id: "o1",
  quorum_percent: 60,
  finalized_at: "2026-07-08T02:00:00Z",
  prev_hash: "0".repeat(64),
  hash_version: HASH_VERSION,
};

describe("sha256Hex", () => {
  it("matches the NIST test vector for 'abc'", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
});

describe("genesisHash", () => {
  it("is deterministic and equals SHA256('verdict-genesis:'+groupId)", async () => {
    expect(await genesisHash("g-1")).toBe(await sha256Hex("verdict-genesis:g-1"));
    expect(await genesisHash("g-1")).not.toBe(await genesisHash("g-2"));
  });
});

describe("computeRecordHash", () => {
  it("is deterministic for identical fields", async () => {
    expect(await computeRecordHash(baseFields)).toBe(await computeRecordHash({ ...baseFields }));
  });

  it("changes when any field changes", async () => {
    const h = await computeRecordHash(baseFields);
    expect(await computeRecordHash({ ...baseFields, title: "x" })).not.toBe(h);
    expect(await computeRecordHash({ ...baseFields, seq: 2 })).not.toBe(h);
  });

  it("ignores properties outside the 13-field contract", async () => {
    const extra = { ...baseFields, this_hash: "should-not-matter" } as RecordFields;
    expect(await computeRecordHash(extra)).toBe(await computeRecordHash(baseFields));
  });

  it("rejects unsupported hash_version", async () => {
    await expect(computeRecordHash({ ...baseFields, hash_version: 99 })).rejects.toThrow(/hash_version/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/chain`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/lib/chain/canonical.ts`:

```ts
/**
 * Canonical JSON serializer, RFC 8785-compliant for Verdict's data domain:
 * strings, booleans, null, INTEGER numbers, arrays, plain objects.
 * Floats are rejected on purpose — JCS float formatting is where
 * cross-platform canonicalization bugs live, and no Verdict field needs them.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isInteger(value)) {
        throw new Error(`canonicalJson: only finite integers are allowed, got ${value}`);
      }
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
      }
      const obj = value as Record<string, unknown>;
      // Array.prototype.sort() compares UTF-16 code units — exactly RFC 8785's key order.
      const body = Object.keys(obj)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
        .join(",");
      return `{${body}}`;
    }
    default:
      throw new Error(`canonicalJson: unsupported type ${typeof value}`);
  }
}
```

`src/lib/chain/types.ts`:

```ts
export interface RecordOption {
  id: string;
  label: string;
}

export interface RecordParticipant {
  member_id: string;
  name: string;
  added_at: string; // ISO 8601 UTC
}

export interface RecordVote {
  participant_id: string;
  option_id: string;
  opinion: string;
  voted_at: string; // ISO 8601 UTC
}

/** The 13 hashed fields — the exact contract from PRD §6.3. */
export interface RecordFields {
  seq: number;
  group_id: string;
  poll_id: string;
  title: string;
  context: string;
  options: RecordOption[];
  participants: RecordParticipant[];
  votes: RecordVote[];
  winning_option_id: string;
  quorum_percent: number;
  finalized_at: string; // ISO 8601 UTC
  prev_hash: string;
  hash_version: number;
}

export type StoredRecord = RecordFields & { this_hash: string };

export interface AnchorPoint {
  seq: number;
  this_hash: string;
}

export type ChainFailure =
  | { kind: "hash_mismatch"; seq: number }
  | { kind: "link_broken"; seq: number }
  | { kind: "bad_genesis"; seq: number }
  | { kind: "seq_gap"; expected: number; found: number }
  | { kind: "unsupported_hash_version"; seq: number }
  | { kind: "anchor_mismatch"; seq: number }
  | { kind: "truncated"; anchorSeq: number; headSeq: number };

export interface VerifyResult {
  valid: boolean;
  checked: number;
  failures: ChainFailure[];
}
```

`src/lib/chain/hash.ts`:

```ts
import { canonicalJson } from "./canonical";
import type { RecordFields } from "./types";

export const HASH_VERSION = 1;

const HASHED_FIELDS = [
  "seq",
  "group_id",
  "poll_id",
  "title",
  "context",
  "options",
  "participants",
  "votes",
  "winning_option_id",
  "quorum_percent",
  "finalized_at",
  "prev_hash",
  "hash_version",
] as const;

export async function sha256Hex(input: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function genesisHash(groupId: string): Promise<string> {
  return sha256Hex(`verdict-genesis:${groupId}`);
}

export async function computeRecordHash(fields: RecordFields): Promise<string> {
  if (fields.hash_version !== HASH_VERSION) {
    throw new Error(`Unsupported hash_version ${fields.hash_version}; this build supports ${HASH_VERSION}`);
  }
  const picked: Record<string, unknown> = {};
  for (const key of HASHED_FIELDS) picked[key] = fields[key];
  return sha256Hex(canonicalJson(picked));
}
```

`src/lib/chain/index.ts`:

```ts
export { canonicalJson } from "./canonical";
export { computeRecordHash, genesisHash, sha256Hex, HASH_VERSION } from "./hash";
export { verifyChain } from "./verify"; // added in Task 3
export type * from "./types";
```

(Until Task 3 lands, leave the `verify` re-export line out; add it in Task 3.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/chain` and `pnpm typecheck`
Expected: all canonical + hash tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chain tests/chain
git commit -m "feat: canonical JSON serializer and record hashing (hash_version 1)"
```

---

### Task 3: Chain verification

**Files:**
- Create: `src/lib/chain/verify.ts`, `tests/chain/helpers.ts`
- Modify: `src/lib/chain/index.ts` (add verify re-export)
- Test: `tests/chain/verify.test.ts`

**Interfaces:**
- Consumes: `computeRecordHash`, `genesisHash`, `HASH_VERSION`, types from Task 2.
- Produces:
  - `verifyChain(groupId: string, records: StoredRecord[], anchor?: AnchorPoint): Promise<VerifyResult>`
  - Test helper `buildChain(groupId: string, n: number): Promise<StoredRecord[]>` (reused by DB tests in Task 6/7).

- [ ] **Step 1: Write failing tests**

`tests/chain/helpers.ts`:

```ts
import { computeRecordHash, genesisHash, HASH_VERSION } from "../../src/lib/chain/hash";
import type { RecordFields, StoredRecord } from "../../src/lib/chain/types";

export async function buildChain(groupId: string, n: number): Promise<StoredRecord[]> {
  const out: StoredRecord[] = [];
  let prev = await genesisHash(groupId);
  for (let seq = 1; seq <= n; seq++) {
    const fields: RecordFields = {
      seq,
      group_id: groupId,
      poll_id: `poll-${seq}`,
      title: `Decision ${seq}`,
      context: "test context",
      options: [
        { id: "o1", label: "Yes" },
        { id: "o2", label: "No" },
      ],
      participants: [{ member_id: "m1", name: "A", added_at: "2026-07-08T00:00:00Z" }],
      votes: [{ participant_id: "pt1", option_id: "o1", opinion: "because", voted_at: "2026-07-08T01:00:00Z" }],
      winning_option_id: "o1",
      quorum_percent: 60,
      finalized_at: "2026-07-08T02:00:00Z",
      prev_hash: prev,
      hash_version: HASH_VERSION,
    };
    const this_hash = await computeRecordHash(fields);
    out.push({ ...fields, this_hash });
    prev = this_hash;
  }
  return out;
}
```

`tests/chain/verify.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { verifyChain } from "../../src/lib/chain/verify";
import { buildChain } from "./helpers";

describe("verifyChain", () => {
  it("passes a valid chain", async () => {
    const chain = await buildChain("g-1", 4);
    const result = await verifyChain("g-1", chain);
    expect(result).toEqual({ valid: true, checked: 4, failures: [] });
  });

  it("passes an empty chain with no anchor", async () => {
    expect((await verifyChain("g-1", [])).valid).toBe(true);
  });

  it("detects a tampered field (hash mismatch at that seq)", async () => {
    const chain = await buildChain("g-1", 4);
    chain[2]!.votes[0]!.opinion = "REWRITTEN";
    const result = await verifyChain("g-1", chain);
    expect(result.valid).toBe(false);
    expect(result.failures).toContainEqual({ kind: "hash_mismatch", seq: 3 });
  });

  it("detects a re-hashed record (link break at the next seq)", async () => {
    // Attacker edits record 2 AND recomputes its hash — record 3's prev_hash exposes it.
    const { computeRecordHash } = await import("../../src/lib/chain/hash");
    const chain = await buildChain("g-1", 4);
    chain[1]!.title = "REWRITTEN";
    chain[1]!.this_hash = await computeRecordHash(chain[1]!);
    const result = await verifyChain("g-1", chain);
    expect(result.valid).toBe(false);
    expect(result.failures).toContainEqual({ kind: "link_broken", seq: 3 });
  });

  it("detects a deleted record (seq gap)", async () => {
    const chain = await buildChain("g-1", 4);
    chain.splice(1, 1); // delete seq 2
    const result = await verifyChain("g-1", chain);
    expect(result.valid).toBe(false);
    expect(result.failures).toContainEqual({ kind: "seq_gap", expected: 2, found: 3 });
  });

  it("detects a wrong genesis (spliced chain from another group)", async () => {
    const chain = await buildChain("g-other", 2);
    const result = await verifyChain("g-1", chain);
    expect(result.valid).toBe(false);
    expect(result.failures).toContainEqual({ kind: "bad_genesis", seq: 1 });
  });

  it("detects a truncated tail via anchor", async () => {
    const chain = await buildChain("g-1", 4);
    const anchor = { seq: 4, this_hash: chain[3]!.this_hash };
    const truncated = chain.slice(0, 2);
    const result = await verifyChain("g-1", truncated, anchor);
    expect(result.valid).toBe(false);
    expect(result.failures).toContainEqual({ kind: "truncated", anchorSeq: 4, headSeq: 2 });
  });

  it("detects anchor mismatch (whole-suffix rewrite)", async () => {
    const honest = await buildChain("g-1", 3);
    const rewritten = await buildChain("g-1", 3);
    rewritten[2]!.title = "REWRITTEN HISTORY";
    const { computeRecordHash } = await import("../../src/lib/chain/hash");
    rewritten[2]!.this_hash = await computeRecordHash(rewritten[2]!);
    const anchor = { seq: 3, this_hash: honest[2]!.this_hash };
    const result = await verifyChain("g-1", rewritten, anchor);
    expect(result.valid).toBe(false);
    expect(result.failures).toContainEqual({ kind: "anchor_mismatch", seq: 3 });
  });

  it("passes when anchor matches", async () => {
    const chain = await buildChain("g-1", 3);
    const anchor = { seq: 2, this_hash: chain[1]!.this_hash };
    expect((await verifyChain("g-1", chain, anchor)).valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/chain/verify.test.ts`
Expected: FAIL — `verify.ts` not found.

- [ ] **Step 3: Implement**

`src/lib/chain/verify.ts`:

```ts
import { computeRecordHash, genesisHash, HASH_VERSION } from "./hash";
import type { AnchorPoint, ChainFailure, StoredRecord, VerifyResult } from "./types";

/**
 * Verifies a group's full chain: recomputes every hash, checks prev-links,
 * seq contiguity, genesis binding, and (optionally) an external anchor.
 * Isomorphic — runs identically in Node and the browser.
 */
export async function verifyChain(
  groupId: string,
  records: StoredRecord[],
  anchor?: AnchorPoint
): Promise<VerifyResult> {
  const failures: ChainFailure[] = [];
  const sorted = [...records].sort((a, b) => a.seq - b.seq);

  let expectedPrev = await genesisHash(groupId);
  let expectedSeq = 1;

  for (const rec of sorted) {
    if (rec.seq !== expectedSeq) {
      failures.push({ kind: "seq_gap", expected: expectedSeq, found: rec.seq });
    }
    if (rec.hash_version !== HASH_VERSION) {
      failures.push({ kind: "unsupported_hash_version", seq: rec.seq });
    } else {
      if (rec.prev_hash !== expectedPrev) {
        failures.push({ kind: rec.seq === 1 ? "bad_genesis" : "link_broken", seq: rec.seq });
      }
      if ((await computeRecordHash(rec)) !== rec.this_hash) {
        failures.push({ kind: "hash_mismatch", seq: rec.seq });
      }
    }
    expectedPrev = rec.this_hash;
    expectedSeq = rec.seq + 1;
  }

  if (anchor) {
    const head = sorted[sorted.length - 1];
    if (!head || anchor.seq > head.seq) {
      failures.push({ kind: "truncated", anchorSeq: anchor.seq, headSeq: head?.seq ?? 0 });
    } else {
      const at = sorted.find((r) => r.seq === anchor.seq);
      if (!at || at.this_hash !== anchor.this_hash) {
        failures.push({ kind: "anchor_mismatch", seq: anchor.seq });
      }
    }
  }

  return { valid: failures.length === 0, checked: sorted.length, failures };
}
```

Add to `src/lib/chain/index.ts`: `export { verifyChain } from "./verify";`

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/chain` and `pnpm typecheck`
Expected: all PASS (canonical, hash, verify).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chain tests/chain
git commit -m "feat: isomorphic chain verification (tamper, gap, genesis, anchor checks)"
```

---

### Task 4: Core schema migration

**Files:**
- Create: `supabase/migrations/00001_core_schema.sql`
- Test: `tests/db/setup.ts`, `tests/db/append.test.ts` (first describe block)

**Interfaces:**
- Produces: tables `members, groups, group_members, polls, options, participants, votes, records` exactly as below. DB tests consume `getPool()` from `tests/db/setup.ts`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/00001_core_schema.sql`:

```sql
-- Verdict core schema (M0). RLS member policies land in M1 with Supabase Auth.

create table members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  joined_at timestamptz not null default now()
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references members(id),
  created_at timestamptz not null default now()
);

create table group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id),
  member_id uuid not null references members(id),
  joined_at timestamptz not null default now(),
  unique (group_id, member_id)
);

create table polls (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id),
  created_by uuid not null references members(id),
  title text not null,
  context text not null default '',
  quorum_percent int not null check (quorum_percent between 1 and 100),
  status text not null default 'open' check (status in ('open', 'withdrawn', 'finalized')),
  created_at timestamptz not null default now()
);

create table options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references polls(id),
  label text not null
);

create table participants (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references polls(id),
  member_id uuid not null references members(id),
  added_at timestamptz not null default now(),
  unique (poll_id, member_id)
);

create table votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references polls(id),
  option_id uuid not null references options(id),
  participant_id uuid not null references participants(id),
  opinion_text text not null check (length(trim(opinion_text)) > 0),
  created_at timestamptz not null default now(),
  unique (participant_id)
);

create table records (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id),
  poll_id uuid not null references polls(id),
  seq int not null check (seq >= 1),
  title text not null,
  context text not null default '',
  options_snapshot jsonb not null,
  participants_snapshot jsonb not null,
  votes_snapshot jsonb not null,
  winning_option_id uuid not null,
  quorum_percent int not null,
  prev_hash text not null,
  this_hash text not null unique,
  hash_version int not null,
  finalized_at timestamptz not null,
  unique (group_id, seq)
);

alter table records enable row level security;
-- Deny-by-default for non-owner roles until M1 adds membership policies.
```

- [ ] **Step 2: Write DB test scaffolding + failing schema test**

`tests/db/setup.ts`:

```ts
import { Pool } from "pg";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  }
  return pool;
}

export async function resetDb(): Promise<void> {
  await getPool().query(
    "truncate votes, participants, options, polls, group_members, groups, members, records cascade"
  );
}

/** Seed one member + group; returns their ids. */
export async function seedGroup(): Promise<{ memberId: string; groupId: string; pollId: string }> {
  const p = getPool();
  const m = await p.query(
    "insert into members (name, email) values ('Yogi', 'yogi@example.com') returning id"
  );
  const memberId: string = m.rows[0].id;
  const g = await p.query("insert into groups (name, created_by) values ('Test Group', $1) returning id", [
    memberId,
  ]);
  const groupId: string = g.rows[0].id;
  const poll = await p.query(
    "insert into polls (group_id, created_by, title, quorum_percent) values ($1, $2, 'T', 60) returning id",
    [groupId, memberId]
  );
  return { memberId, groupId, pollId: poll.rows[0].id };
}
```

Start `tests/db/append.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, resetDb, seedGroup } from "./setup";

const hasDb = !!process.env.DATABASE_URL;

describe.runIf(hasDb)("schema", () => {
  beforeEach(resetDb);
  afterAll(async () => {
    await getPool().end();
  });

  it("enforces UNIQUE(group_id, seq) on records", async () => {
    const { groupId, pollId } = await seedGroup();
    const insert = `insert into records
      (group_id, poll_id, seq, title, options_snapshot, participants_snapshot, votes_snapshot,
       winning_option_id, quorum_percent, prev_hash, this_hash, hash_version, finalized_at)
      values ($1, $2, 1, 't', '[]', '[]', '[]', gen_random_uuid(), 60, 'p', $3, 1, now())`;
    await getPool().query(insert, [groupId, pollId, "hash-a"]);
    await expect(getPool().query(insert, [groupId, pollId, "hash-b"])).rejects.toThrow(/unique/i);
  });

  it("rejects votes with blank opinions", async () => {
    const { groupId, pollId, memberId } = await seedGroup();
    const opt = await getPool().query("insert into options (poll_id, label) values ($1, 'A') returning id", [
      pollId,
    ]);
    const part = await getPool().query(
      "insert into participants (poll_id, member_id) values ($1, $2) returning id",
      [pollId, memberId]
    );
    await expect(
      getPool().query(
        "insert into votes (poll_id, option_id, participant_id, opinion_text) values ($1, $2, $3, '   ')",
        [pollId, opt.rows[0].id, part.rows[0].id]
      )
    ).rejects.toThrow(/check/i);
    void groupId;
  });
});
```

- [ ] **Step 3: Run tests**

Without a DB: `pnpm test` — the describe block is skipped; suite stays green.
With local Supabase (`supabase start`, migrations applied via `supabase db reset` or `psql -f supabase/migrations/00001_core_schema.sql`):
Run: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm vitest run tests/db`
Expected: both schema tests PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00001_core_schema.sql tests/db
git commit -m "feat: core schema migration with per-group seq constraint"
```

---

### Task 5: Append-only enforcement on records

**Files:**
- Create: `supabase/migrations/00002_records_append_only.sql`
- Test: append to `tests/db/append.test.ts`

**Interfaces:**
- Produces: role `verdict_ledger_writer` (INSERT+SELECT only) and trigger `records_immutable` that raises on UPDATE/DELETE. Task 7 disables this trigger deliberately to simulate a malicious owner.

- [ ] **Step 1: Write the migration**

`supabase/migrations/00002_records_append_only.sql`:

```sql
-- Layer 1: dedicated app role that can only ever INSERT/SELECT records.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'verdict_ledger_writer') then
    create role verdict_ledger_writer nologin;
  end if;
end $$;

grant select, insert on records to verdict_ledger_writer;
-- Deliberately no UPDATE/DELETE/TRUNCATE grants.

-- Layer 2: trigger blocks mutation for every role, including the table owner,
-- unless the trigger itself is disabled/dropped (which the anchor makes detectable).
create or replace function verdict_block_record_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'records are immutable: % is not permitted', tg_op;
end $$;

create trigger records_immutable
  before update or delete on records
  for each row execute function verdict_block_record_mutation();
```

- [ ] **Step 2: Write failing tests** (append to `tests/db/append.test.ts`)

```ts
describe.runIf(hasDb)("append-only enforcement", () => {
  beforeEach(resetDb);

  async function insertOne(): Promise<{ groupId: string }> {
    const { groupId, pollId } = await seedGroup();
    await getPool().query(
      `insert into records
        (group_id, poll_id, seq, title, options_snapshot, participants_snapshot, votes_snapshot,
         winning_option_id, quorum_percent, prev_hash, this_hash, hash_version, finalized_at)
        values ($1, $2, 1, 't', '[]', '[]', '[]', gen_random_uuid(), 60, 'p', 'h1', 1, now())`,
      [groupId, pollId]
    );
    return { groupId };
  }

  it("blocks UPDATE on records", async () => {
    await insertOne();
    await expect(getPool().query("update records set title = 'tampered'")).rejects.toThrow(/immutable/);
  });

  it("blocks DELETE on records", async () => {
    await insertOne();
    await expect(getPool().query("delete from records")).rejects.toThrow(/immutable/);
  });
});
```

Note: `resetDb` truncates `records` — TRUNCATE fires no row triggers, which is exactly why the anchor (M4) exists. Keep `records` in the truncate list for test hygiene.

- [ ] **Step 3: Apply migration + run tests**

Run: `psql "$DATABASE_URL" -f supabase/migrations/00002_records_append_only.sql` (or `supabase db reset`), then `DATABASE_URL=... pnpm vitest run tests/db`
Expected: UPDATE/DELETE tests PASS (exception message contains "immutable").

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00002_records_append_only.sql tests/db/append.test.ts
git commit -m "feat: INSERT-only role and mutation-blocking trigger on records"
```

---

### Task 6: appendRecord — advisory-lock sealing primitive

**Files:**
- Create: `src/lib/db/appendRecord.ts`
- Test: append to `tests/db/append.test.ts`

**Interfaces:**
- Consumes: `computeRecordHash`, `genesisHash`, `HASH_VERSION`, `RecordFields`, `StoredRecord` from `src/lib/chain`.
- Produces:

```ts
export type NewRecordInput = Omit<RecordFields, "seq" | "prev_hash" | "hash_version">;
export async function appendRecord(pool: Pool, input: NewRecordInput): Promise<StoredRecord>;
```

M1's poll-finalization service will call this with real poll snapshots.

- [ ] **Step 1: Write failing tests** (append to `tests/db/append.test.ts`)

```ts
import { appendRecord, type NewRecordInput } from "../../src/lib/db/appendRecord";
import { verifyChain } from "../../src/lib/chain/verify";
import type { StoredRecord } from "../../src/lib/chain/types";

function makeInput(groupId: string, pollId: string, title: string): NewRecordInput {
  return {
    group_id: groupId,
    poll_id: pollId,
    title,
    context: "ctx",
    options: [
      { id: "o1", label: "Yes" },
      { id: "o2", label: "No" },
    ],
    participants: [{ member_id: "m1", name: "A", added_at: "2026-07-08T00:00:00Z" }],
    votes: [{ participant_id: "pt1", option_id: "o1", opinion: "because", voted_at: "2026-07-08T01:00:00Z" }],
    winning_option_id: "11111111-1111-1111-1111-111111111111",
    quorum_percent: 60,
    finalized_at: "2026-07-08T02:00:00.000Z",
  };
}

async function loadChain(groupId: string): Promise<StoredRecord[]> {
  const { rows } = await getPool().query(
    `select seq, group_id, poll_id, title, context,
            options_snapshot as options, participants_snapshot as participants, votes_snapshot as votes,
            winning_option_id, quorum_percent,
            to_char(finalized_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as finalized_at,
            prev_hash, hash_version, this_hash
       from records where group_id = $1 order by seq`,
    [groupId]
  );
  return rows as StoredRecord[];
}

describe.runIf(hasDb)("appendRecord", () => {
  beforeEach(resetDb);

  it("appends sequential records that verify as a valid chain", async () => {
    const { groupId, pollId } = await seedGroup();
    for (let i = 1; i <= 3; i++) {
      await appendRecord(getPool(), makeInput(groupId, pollId, `Decision ${i}`));
    }
    const chain = await loadChain(groupId);
    expect(chain.map((r) => r.seq)).toEqual([1, 2, 3]);
    const result = await verifyChain(groupId, chain);
    expect(result.failures).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("assigns unique gap-free seqs under concurrent appends", async () => {
    const { groupId, pollId } = await seedGroup();
    await Promise.all(
      Array.from({ length: 5 }, (_, i) => appendRecord(getPool(), makeInput(groupId, pollId, `C${i}`)))
    );
    const chain = await loadChain(groupId);
    expect(chain.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5]);
    expect((await verifyChain(groupId, chain)).valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `DATABASE_URL=... pnpm vitest run tests/db`
Expected: FAIL — `appendRecord` module not found.

- [ ] **Step 3: Implement**

`src/lib/db/appendRecord.ts`:

```ts
import type { Pool } from "pg";
import { computeRecordHash, genesisHash, HASH_VERSION } from "../chain/hash";
import type { RecordFields, StoredRecord } from "../chain/types";

export type NewRecordInput = Omit<RecordFields, "seq" | "prev_hash" | "hash_version">;

/**
 * Atomically appends a record to a group's chain.
 * The per-group advisory lock serializes concurrent finalizations;
 * UNIQUE(group_id, seq) is the backstop if the lock is ever bypassed.
 */
export async function appendRecord(pool: Pool, input: NewRecordInput): Promise<StoredRecord> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [input.group_id]);

    const head = await client.query(
      "select seq, this_hash from records where group_id = $1 order by seq desc limit 1",
      [input.group_id]
    );
    const seq: number = head.rows.length ? head.rows[0].seq + 1 : 1;
    const prev_hash: string = head.rows.length ? head.rows[0].this_hash : await genesisHash(input.group_id);

    // Deterministic array order before hashing — array order is significant in canonical JSON.
    const fields: RecordFields = {
      ...input,
      options: [...input.options].sort((a, b) => a.id.localeCompare(b.id)),
      participants: [...input.participants].sort((a, b) => a.member_id.localeCompare(b.member_id)),
      votes: [...input.votes].sort((a, b) => a.participant_id.localeCompare(b.participant_id)),
      seq,
      prev_hash,
      hash_version: HASH_VERSION,
    };
    const this_hash = await computeRecordHash(fields);

    await client.query(
      `insert into records
        (group_id, poll_id, seq, title, context, options_snapshot, participants_snapshot, votes_snapshot,
         winning_option_id, quorum_percent, prev_hash, this_hash, hash_version, finalized_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        fields.group_id,
        fields.poll_id,
        fields.seq,
        fields.title,
        fields.context,
        JSON.stringify(fields.options),
        JSON.stringify(fields.participants),
        JSON.stringify(fields.votes),
        fields.winning_option_id,
        fields.quorum_percent,
        fields.prev_hash,
        this_hash,
        fields.hash_version,
        fields.finalized_at,
      ]
    );
    await client.query("commit");
    return { ...fields, this_hash };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `DATABASE_URL=... pnpm vitest run tests/db` and `pnpm typecheck`
Expected: PASS, including the concurrency test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/appendRecord.ts tests/db/append.test.ts
git commit -m "feat: advisory-locked appendRecord sealing primitive"
```

---

### Task 7: M0 exit criteria — end-to-end tamper detection

**Files:**
- Test: append final describe block to `tests/db/append.test.ts`

**Interfaces:**
- Consumes: everything above. This is the milestone gate from PRD §11: detect (a) a tampered row, (b) a deleted row, (c) a truncated tail — performed via direct SQL as a malicious owner would (trigger disabled).

- [ ] **Step 1: Write the tests**

```ts
describe.runIf(hasDb)("M0 exit criteria: tamper detection end-to-end", () => {
  beforeEach(resetDb);

  async function seedChain(n: number): Promise<{ groupId: string; sealed: StoredRecord[] }> {
    const { groupId, pollId } = await seedGroup();
    const sealed: StoredRecord[] = [];
    for (let i = 1; i <= n; i++) {
      sealed.push(await appendRecord(getPool(), makeInput(groupId, pollId, `Decision ${i}`)));
    }
    return { groupId, sealed };
  }

  async function asMaliciousOwner(sql: string, params: unknown[] = []): Promise<void> {
    // A malicious DB owner can disable the trigger — the chain must still expose them.
    await getPool().query("alter table records disable trigger records_immutable");
    await getPool().query(sql, params);
    await getPool().query("alter table records enable trigger records_immutable");
  }

  it("detects a directly tampered row", async () => {
    const { groupId } = await seedChain(4);
    await asMaliciousOwner(
      `update records set votes_snapshot = '[{"participant_id":"pt1","option_id":"o2","opinion":"changed my mind","voted_at":"2026-07-08T01:00:00Z"}]'
        where group_id = $1 and seq = 2`,
      [groupId]
    );
    const result = await verifyChain(groupId, await loadChain(groupId));
    expect(result.valid).toBe(false);
    expect(result.failures).toContainEqual({ kind: "hash_mismatch", seq: 2 });
  });

  it("detects a deleted row as a seq gap", async () => {
    const { groupId } = await seedChain(4);
    await asMaliciousOwner("delete from records where group_id = $1 and seq = 2", [groupId]);
    const result = await verifyChain(groupId, await loadChain(groupId));
    expect(result.valid).toBe(false);
    expect(result.failures).toContainEqual({ kind: "seq_gap", expected: 2, found: 3 });
  });

  it("detects a truncated tail via the anchor", async () => {
    const { groupId, sealed } = await seedChain(4);
    const anchor = { seq: 4, this_hash: sealed[3]!.this_hash };
    await asMaliciousOwner("delete from records where group_id = $1 and seq in (3, 4)", [groupId]);
    const result = await verifyChain(groupId, await loadChain(groupId), anchor);
    expect(result.valid).toBe(false);
    expect(result.failures).toContainEqual({ kind: "truncated", anchorSeq: 4, headSeq: 2 });
  });
});
```

- [ ] **Step 2: Run the full suite**

Run: `DATABASE_URL=... pnpm test` and `pnpm typecheck`
Expected: every test in `tests/chain` and `tests/db` PASSES. **This is the M0 phase gate.**

- [ ] **Step 3: Commit**

```bash
git add tests/db/append.test.ts
git commit -m "test: M0 exit criteria — tamper, deletion, truncation all detected"
```

---

## Post-M0 checklist

- [ ] All chain-library tests pass with no DB (`pnpm test` on a clean machine)
- [ ] All DB tests pass against local Supabase (`supabase start` + migrations + `DATABASE_URL=... pnpm test`) — **blocked on Docker/Supabase CLI being installed locally; code and tests are ready**
- [ ] Update this plan's checkboxes; mark M0 done in PRD tracking
- [ ] Next: write M1 plan (groups/polls/votes flow + Supabase Auth + RLS policies + finalization service calling `appendRecord`)
