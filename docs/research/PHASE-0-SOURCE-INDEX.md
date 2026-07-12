# Phase 0 Source Index

Compiled: 2026-07-12

## Research Record

- Question: What is the current repository and linked-cloud baseline before continuing Phase 10 and certification work?
- Sources consulted: `package.json`, `AGENTS.md`, `.github/workflows/ci.yml`, `.github/workflows/cron.yml`, `src/app/api/line/route.ts`, `src/lib/agent/handle.ts`, `src/lib/intent/router.ts`, `src/lib/agent/registry.ts`, `src/lib/cron/routes.ts`, `src/lib/env.ts`, `next.config.ts`, all 34 migration files, previous Hoshi reports, and existing Phase 0-9 evidence.
- Official documentation: Next.js `after()` API, version 16.2.2 documentation consulted through Context7 on 2026-07-12: https://nextjs.org/docs/app/api-reference/functions/after
- Exact APIs and constraints: `after()` runs after the response but only within the route's configured/platform duration; it is suitable for post-response work, not a substitute for durable persistence. The LINE route correctly persists `webhook_events` before scheduling `after()` processing.
- Existing repository patterns to reuse: `env` centralizes configuration; `CRON_ROUTES` is the canonical schedule inventory; `handle()` owns canonical user mapping, `touchUser()`, mutation idempotency, and dispatch; migration parity uses `supabase migration list`.
- Allowed implementation approach: documentation and inventory corrections only. Use a new timestamped migration for schema changes; apply cloud migrations only with explicit authorization.
- Approaches rejected: treating `after()` as a durable worker, treating local migrations as cloud proof, or marking local test results as live-integration evidence.
- Remaining uncertainty: production revision, Vercel configuration, QStash schedules, cloud grants/constraints beyond migration history, storage-orphan count, PITR, authenticated LIFF accessibility, and canary evidence require external access.

## Verified Repository State

| Item | Value | Evidence |
|---|---:|---|
| Next.js | 16.2.10 | `package.json` |
| React | 19.2.4 | `package.json` |
| Local migrations | 34 | `npm run check:migrations` |
| Cloud migrations | 28 | `npm run check:migrations` |
| Unapplied migrations | 6 | `20260712100000`, `20260712120000` through `20260712160000` |
| Cron routes | 10 | `src/lib/cron/routes.ts` |
| Router actions | 49 | `Action` union and `validAction()` composition |
| Test suite | 290 tests in 19 files | `npm test` |
| Security audit | 0 high, 1 medium | `npm run audit:security` |

## External Checks

| Item | Status | Blocker |
|---|---|---|
| Linked cloud migration parity | BLOCKED | Six local migrations require reviewed deployment via `supabase db push` |
| QStash schedule inventory | BLOCKED | `QSTASH_TOKEN` is unset |
| Production revision and Vercel config | BLOCKED | No Vercel dashboard/API evidence |
| Cloud RLS, grants, indexes, and constraints | BLOCKED | Migration history does not prove live database state |
| Production data metrics and Storage orphans | BLOCKED | Requires cloud queries and Storage listing |
| PITR, authenticated LIFF WCAG, and preview canary | BLOCKED | Require production access, device/login state, and owner approval |
