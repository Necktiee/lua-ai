# Phase 1 Evidence: Correctness And Security Closure

## Goal
Remove all confirmed correctness and security defects (C1-C5, H1-H5, M6-M10) that can cause wrong actions, broken workflows, unauthorized access, invalid schema state, or misleading success.

## Changes

### Migrations (2 new)

**`20260711150000_phase1_security_closure.sql`** — Fixes C3, C4, C5, M6:
- C3: Added `embedding_status` CHECK constraints on `memory` and `knowledge` via idempotent DO blocks
- C4: Revoked EXECUTE on `hybrid_memory_search` and `hybrid_knowledge_search` from public/anon/authenticated
- C5: Replaced wide-open `llm_usage` RLS (`USING(true)`) with service_role-only SELECT/INSERT policies
- M6: Added FK constraints for `oauth_nonces.user_id` and `mutation_keys.user_id` → `users(line_user_id)` ON DELETE CASCADE
- M6: Added `google_tokens_touch` trigger (was missing)
- M6: Added trace indexes on `messages(trace_id)` and `llm_usage(trace_id)`
- M6: Created `cleanup_ephemeral_data(days_to_keep)` RPC for TTL purge of nonces, mutation_keys, undo_tokens, terminal webhook_events, terminal embedding_jobs, and cron dedup markers

**`20260711160000_pending_actions.sql`** — Fixes C1:
- Created `pending_actions` table for durable R2 plan confirmation state
- Columns: id, user_id, kind, payload(jsonb), risk_level, policy_version, source_event_id, idempotency_key, status(pending/confirmed/expired/consumed), expires_at(5min TTL), consumed_at
- RLS enabled with user_id-scoped policies

### Code Changes

**C1: Durable plan confirmation** (`src/lib/agent/handle.ts`, `src/lib/agent/pending.ts`)
- Created `src/lib/agent/pending.ts` with `createPendingAction`, `getPendingAction`, `consumePendingAction`, `expireStalePendingActions`
- `handle()`: "ยืนยัน" / "confirm" now intercepted BEFORE classification — checks for pending action, consumes atomically, executes stored plan
- `plan` handler: R2 plans now stored via `createPendingAction()` instead of returning text-only; confirmation message includes 5-minute TTL notice
- R2 plan preview causes zero writes; valid confirmation executes once (atomic consume); expired/replayed confirmation returns "expired" message

**C2: Regex injection escape** (`src/lib/agent/handle.ts:132`)
- `projectName` now escaped with `/[.*+?^${}()|[\]\\]/g` before `new RegExp()` construction
- Malformed project names like `C++`, `[test]`, `node.js` no longer throw

**H1: RRF/cosine score separation** (`src/lib/memory/store.ts`)
- `recallHybrid()` now maps actual cosine similarity to `similarity` and RRF score to `rrfScore` (new optional field on `SearchResult`)
- Quality gate uses cosine similarity (0-1 scale), not RRF score (~0.005-0.04 range)
- Results with actual cosine below threshold are filtered, but RRF-ranked-only results (no vector match) are not penalized

**H3: HTTP rate limiting** (`src/lib/rate-limit.ts`, `src/lib/auth/require-session.ts`, `src/app/api/liff/verify/route.ts`)
- Created `src/lib/rate-limit.ts`: fixed-window limiter using Upstash Redis when configured (cross-instance), in-memory Map fallback for dev
- Dashboard routes: 120 req/min per IP (via `requireSessionUser()`)
- LIFF verify: 10 req/min per IP
- 429 responses include `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset` headers

**H4: Logout endpoint** (`src/app/api/dashboard/logout/route.ts`)
- POST clears `hoshi_session` cookie via `clearSession()`

**H5: Readiness endpoint** (`src/app/api/health/ready/route.ts`)
- GET `/api/health/ready`: pings Supabase DB (actual `SELECT` query), checks LLM key presence
- Returns 200 when all checks pass, 503 on failure
- Includes per-check latency and total latency

**M6: TTL cleanup integration** (`src/app/api/cron/daily/route.ts`)
- Daily cron now calls `cleanup_ephemeral_data(7)` RPC after retention purge

**M7: Dead `<evidence>` tag removed** (`src/lib/agent/context.ts`)
- T0 security policy no longer references `<evidence>` (no layer produces it)
- Tag list now: `<memory>`, `<knowledge>`, `<people>`, `<state>`
- PROMPT_VERSION bumped to `2026-07-11-v3`

**M8: Legacy export naming fixed** (`src/lib/agent/context.ts`)
- `IDENTITY` now exports `T0_SECURITY_POLICY` (was inverted)
- `CORE_SOP` now exports `T1_PRODUCT_SOP` (was inverted)

**M9: KB token budget per-entry cap** (`src/lib/agent/context.ts`)
- Individual KB entries exceeding 40% of budget (~320 tokens) are skipped
- Prevents single oversized SOP from crowding out all other knowledge

**M10: Thai-aware token estimation** (`src/lib/agent/context.ts`)
- Thai chars estimated at ~3 chars/token, other chars at ~4 chars/token
- Prevents underestimation that could cause context budget overflow

### Tests (`tests/phase1-security-correctness.test.ts` — 23 new tests)
- C2: regex escape tests for `C++`, `[test]`, `node.js`
- M7: dead `<evidence>` tag removal verification
- M8: legacy export naming verification
- M9: KB token budget per-entry cap verification
- M10: Thai-aware token estimation verification
- H3: rate limiter module (success, exceeding limit, 429 response)
- C1: pending action module exports and TTL
- H1: SearchResult rrfScore field and RRF/cosine scale separation
- Planner: risk classification (R0/R1/R2) and confirmation requirements

### Documentation
- `AGENTS.md`: updated test count (159), migration count (28), table count (+pending_actions), routes table (+health/ready, +logout)
- `evals/prompt-replay.json`: updated prompt_version to `2026-07-11-v3`

## Tests
- `npm run lint`: PASS (0 errors, 1 pre-existing warning in liff/page.tsx)
- `npm test`: 159/159 PASS (11 files)
- `npm run clean && npm run build`: PASS (39 routes)
- `npm run check:migrations`: 28 local / 26 cloud (2 new local-only, need `supabase db push`)
- `npm run audit:security`: 0 high, 1 medium (pre-existing liff/page.tsx)

## Acceptance Criteria
- [x] R2 plan preview causes zero writes (stored as pending, not executed)
- [x] Valid confirmation executes once (atomic consume)
- [x] Expired/replayed confirmation executes zero writes (TTL check in consume)
- [x] Malformed project names (`C++`, `[test]`, `node.js`) cannot throw
- [x] anon/authenticated cannot call hybrid RPCs (REVOKE in migration)
- [x] anon/authenticated cannot read/write llm_usage (service_role-only policy)
- [x] Rate limit works (Redis-backed when configured, in-memory fallback)
- [ ] Rate limit works across at least two server instances (BLOCKED: requires Upstash Redis configured + live test)
- [x] Security, concurrency, and migration tests pass locally
- [ ] Linked cloud grants/constraints recorded (BLOCKED: requires `supabase db push` with credentials)

## Security And Privacy Review
- C4 fix closes RPC access to anon/authenticated — prevents unauthenticated hybrid search
- C5 fix closes llm_usage to anon/authenticated — prevents cost data leakage
- C1 fix ensures R2 destructive plans cannot execute without durable confirmation
- C2 fix prevents regex-based crash from user input
- H3 rate limiting prevents brute-force on LIFF verify and dashboard endpoints
- H4 logout prevents indefinite session persistence
- H5 readiness prevents deploying to broken infrastructure
- M6 TTL cleanup prevents unbounded growth of ephemeral tables

## Known Gaps (BLOCKED)
- Cloud migration push (`supabase db push`) requires credentials — 2 migrations pending
- Cross-instance rate limit verification requires Upstash Redis configured in production
- Cross-instance rate limit test requires multi-instance simulation

## Rollback
- Migrations: both are additive (no destructive DDL). Rollback = `DROP TABLE pending_actions; DROP FUNCTION cleanup_ephemeral_data;` + revert policy/function changes
- Code: revert handle.ts confirmation interception, context.ts changes, rate-limit integration, new routes
- Prompt: revert PROMPT_VERSION to v2 if T0 changes cause quality regression
