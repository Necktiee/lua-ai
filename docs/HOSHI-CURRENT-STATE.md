# Hoshi Current State

Last verified: 2026-07-12. This is a source-and-command baseline, not production certification.

## Verified

| Area | Current fact | Evidence |
|---|---|---|
| Runtime | Next.js 16.2.10 App Router; `googleapis` externalized | `package.json`, `next.config.ts` |
| Event flow | Raw-signature verification -> durable `webhook_events` insertion -> HTTP 200 -> `after()` worker | `src/app/api/line/route.ts` |
| Write safety | Canonical owner mapping, `touchUser()`, and mutation idempotency run before dispatch | `src/lib/agent/handle.ts` |
| Cron inventory | Ten scheduled routes declared in one source | `src/lib/cron/routes.ts` |
| Intelligence | 49 actions; registry drives action metadata and planner policy | `src/lib/intent/router.ts`, `src/lib/agent/registry.ts` |
| Local database history | 34 migration files | `npm run check:migrations` |
| Tests | 290 passing tests in 19 files | `npm test` |

## Inventory

| Inventory | Verified contents |
|---|---|
| API surface | 43 route-handler files: LINE, LIFF verification, health/readiness, Calendar OAuth, 10 cron routes, admin operations/schedule setup, and authenticated dashboard APIs for account, calendar, commitments, expenses, export, follow-ups, goals, Google, journal, knowledge, messages, memories, people, recommendations, reminders, settings, todos, undo, and usage. |
| Schema surface | Operational tables for users, messages, memory/knowledge, todos/reminders/calendar, people/follow-ups, expenses/subscriptions/goals/journal, OAuth/Google tokens, webhook/mutation/undo/embedding jobs, observability, and Phase 10 commitments/decisions/recommendation feedback. |
| Feature state | Phase 1-9 evidence exists; Phase 10 foundations are present but the ordered feature set is incomplete; Phase 11 certification is incomplete. |

## Command Results

| Command | Result |
|---|---|
| `npm run baseline` | PASS; DB counters read from configured local environment |
| `npm run lint` | PASS |
| `npm test` | PASS: 290 tests, 19 files |
| `npm run clean && npm run build` | PASS: 43 API routes plus `/liff` |
| `npm run audit:security` | PASS policy: 0 high; 1 medium direct `process.env` read in `src/app/liff/page.tsx` |
| `npm run check:migrations` | FAIL: six local migrations are unapplied to linked cloud |
| `npm run check:schedules` | BLOCKED: `QSTASH_TOKEN` unset; 10 intended routes listed |

## Deployment Blocker

The linked cloud project has migrations through `20260711160000`. The following local migrations are unapplied: `20260712100000_phase5_knowledge_lifecycle.sql`, `20260712120000_phase6_thai_retrieval.sql`, `20260712130000_phase10_commitments.sql`, `20260712140000_phase10_recommendation_feedback.sql`, `20260712150000_phase10_decisions.sql`, and `20260712160000_fix_pending_action_cancel_status.sql`.

Do not claim cloud parity, Phase 5/6/10 cloud behavior, or the pending-plan cancellation repair as deployed until an authorized `supabase db push` succeeds and parity is rerun.

## External Evidence

BLOCKED: Vercel deployment revision/configuration, QStash schedules, cloud grants/RLS/indexes/constraints, production queue and storage metrics, PITR restore, authenticated LIFF WCAG, and preview canary.

## Current Scope

Phase 1-9 evidence reports exist. Phase 10 has Commitment Ledger, recommendation feedback, and Decision Journal schema/repository foundations, but its feature order and usefulness acceptance criteria are not complete. Phase 11 certification is not complete.
