# Verdict M4 — Anchoring & Export Implementation Plan

> Same-session author/executor format. REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** The mechanism that makes "not even the admin can rewrite history" true: a scheduled GitHub Action commits each group's chain head `(seq, this_hash)` plus a full record export to the repo, and the Verify page compares the live chain against that public anchor. The committed export doubles as the backup.

**Architecture:** `buildExport(pool)` produces `{generated_at, groups: [{group_id, group_name, head_seq, head_hash, records}]}`. `GET /api/anchor-export` serves it behind `Bearer ANCHOR_EXPORT_TOKEN`. The workflow (`.github/workflows/anchor.yml`, cron every 6h + manual) curls the endpoint, splits it into `anchors/<group_id>/latest.json` (head only) + `anchors/<group_id>/export.json` (full), and commits if changed. The verify data route fetches `latest.json` from `ANCHOR_RAW_BASE_URL` server-side and hands it to the browser verifier, which already understands anchors (M0).

## Global Constraints
- Anchor `latest.json` shape: `{group_id, seq, this_hash, anchored_at}` — `seq`+`this_hash` are exactly M0's `AnchorPoint`.
- Export must be restorable: full record rows including snapshots and hashes.
- Verify page must clearly distinguish "verified against public anchor" from "internally consistent only" (no anchor configured yet).

## Tasks
1. [x] **Export lib + route**: `src/lib/anchor/export.ts` (`buildExport`), `GET /api/anchor-export` (Bearer token). DB-gated test: export contains groups, heads match chain tails.
2. [x] **Workflow**: `.github/workflows/anchor.yml` — cron `17 */6 * * *` + workflow_dispatch; needs `APP_URL` + `ANCHOR_EXPORT_TOKEN` repo secrets; jq-splits response; commits `anchors/` if changed.
3. [x] **Verify integration**: data route fetches `${ANCHOR_RAW_BASE_URL}/anchors/<groupId>/latest.json` (no-store) when configured; verify page shows anchor status (green "checked against public anchor of <date>" / muted "no public anchor configured").
4. [x] **Docs**: README.md — full production setup: Supabase project, migrations, Vercel env, anchor repo + secrets, restore-from-export procedure.
5. [x] **Gate**: tests + typecheck + build green; merge.

## Exit criteria (PRD §11 M4)
Anchor published and independently checkable; restore-from-export documented and tested at the SQL level (chain re-verifies after reload).
