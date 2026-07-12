# Phase 0 Evidence

## Goal

Establish an evidence-backed current baseline and research index; finish only when repository, cloud dependencies, deployed revision, known gaps, and all verification commands are recorded without stale claims.

## Research

See `docs/research/PHASE-0-SOURCE-INDEX.md`. Research consulted current repository configuration, runtime entrypoints, migration inventory, prior reports, and Next.js `after()` documentation on 2026-07-12.

## Changes

- Refreshed `docs/BASELINE-REPORT.md` with current local database metrics and 34 local migrations.
- Replaced stale Phase 0 research and current-state inventories with source-verified counts and explicit blockers.
- No product behavior or cloud schema was changed.

## Tests

Executed 2026-07-12:

| Command | Result |
|---|---|
| `npm run baseline` | PASS; users 3, memory 6, null embeddings 0, webhook events 0, pending reminders 1 |
| `npm run lint` | PASS |
| `npm test` | PASS: 290 tests in 19 files |
| `npm run clean && npm run build` | PASS: 43 API routes plus `/liff` |
| `npm run audit:security` | 0 high, 1 medium |
| `npm run check:migrations` | FAIL: six local migrations not applied to linked cloud |
| `npm run check:schedules` | BLOCKED: no `QSTASH_TOKEN`; intended route count 10 |

## Acceptance Criteria

- [x] Baseline commands and results recorded.
- [x] External unknowns explicitly marked BLOCKED.
- [x] Stale action, migration, cron, test, and API-route claims removed from authoritative Phase 0 documents.
- [ ] Cloud migrations and live schema grants/constraints verified. BLOCKED pending authorized deployment and cloud inspection.

## Security And Privacy Review

- No behavior changes in this phase.
- Security audit reports one medium direct environment read: `src/app/liff/page.tsx:24`.
- Cloud migration parity failure means recent schema hardening and Phase 10 schema are not live-evidenced.

## Performance And Cost

No performance measurement was performed. Local build passed; production latency and cost remain BLOCKED.

## Rollback

Documentation-only changes can be reverted without runtime impact. Do not revert unrelated worktree changes.

## Known Gaps

- BLOCKED: six unapplied linked-cloud migrations.
- BLOCKED: QStash, Vercel, production database/Storage, PITR, authenticated LIFF accessibility, and canary evidence.
- DEFERRED: Phase 10 feature completion and Phase 11 certification.
