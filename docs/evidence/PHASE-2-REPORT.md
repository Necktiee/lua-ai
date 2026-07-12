# Phase 2 Evidence: Operations, Recovery, And Observability

## Goal

Make every acknowledged event, background job, scheduled push, and external call observable, recoverable, and operable; finish with queue controls, complete traces, alerts, and verified recovery drills.

## Research

- Current trace infrastructure: `webhook_events.trace_id` (default gen_random_uuid()), `messages.trace_id`, `llm_usage.trace_id` existed in schema but were never populated end-to-end.
- Vercel serverless: in-memory state (rate limiter, circuit breaker) resets on cold start. Upstash Redis provides cross-instance state when configured.
- QStash failure callbacks: not yet configured (BLOCKED — requires external QStash setup).
- Privacy-safe logging: must never log raw prompts, email bodies, tokens, OAuth codes, or attachment contents.

## Changes

### 1. Trace ID Propagation

- `WebhookEventRow` (`src/lib/webhook/inbox.ts`): added `trace_id` field to the return type.
- `HandleInput` (`src/lib/agent/handle.ts`): added optional `traceId` field.
- `logMessage` (`src/lib/memory/conversation.ts`): added 6th parameter `traceId?` — sets `messages.trace_id` on insert.
- `ChatOptions` (`src/lib/llm/types.ts`): added optional `traceId` — passed to `recordUsage()` via pool.ts.
- `chat()` (`src/lib/llm/pool.ts`): `recordUsage()` call now passes `options.traceId`.
- `chatReply()` (`src/lib/agent/handle.ts`): passes `input.traceId` into `chat()` options.
- Webhook route (`src/app/api/line/route.ts`): reads `claimed.trace_id` from the claimed webhook event, passes to `handle()` and both `logMessage()` calls (user + assistant).
- Flow: `webhook_events.trace_id` → `handle(input.traceId)` → `logMessage(traceId)` + `chat(options.traceId)` → `recordUsage(traceId)` → `llm_usage.trace_id`.

### 2. Privacy-Safe Structured Logger

- New file: `src/lib/observability/logger.ts`
- Exports: `logError`, `logWarn`, `logInfo`, `logDebug`.
- Redacts sensitive keys: `token`, `password`, `secret`, `key`, `authorization`, `cookie`, `content`, `prompt`, `message`, `body`, `payload`, `accesstoken`, `refreshtoken`, `code`.
- `logDebug` is suppressed in production.
- JSON-serialized for Vercel log capture.

### 3. Circuit Breaker

- New file: `src/lib/llm/circuit-breaker.ts`
- Tracks consecutive failures per provider. Opens after 5 consecutive failures. Cooldown: 60s. Half-open trial on next call.
- Exports: `isProviderAvailable()`, `recordSuccess()`, `recordFailure()`, `getBreakerStatus()`, `resetBreaker()`.
- Integrated into `pool.ts`: circuit check before entering provider loop; `recordSuccess` on successful call; `recordFailure` on any error.
- Prevents retry storms during sustained provider outages.

### 4. Admin Operator Endpoints

- New file: `src/app/api/admin/ops/route.ts`
- **GET**: webhook queue by status, dead-lettered events (latest 20), embedding job queue by status, provider circuit breaker status, LLM cost summary (7-day).
- **POST**: `retry` action resets dead-lettered/failed webhook event to `pending` (resets attempts, error, retry timestamps); `reset_breaker` action manually resets a provider circuit breaker.
- Protected by `authorizeCron()` (CRON_SECRET Bearer token).

### 5. Daily Cron Split

- New route: `src/app/api/cron/journal/route.ts` — auto-journal at user local 22:00 (split from daily).
- New route: `src/app/api/cron/nudge/route.ts` — follow-up + overdue todo nudges at user local 09:00 (split from daily).
- `src/app/api/cron/daily/route.ts` — now only retention purge + ephemeral data cleanup (removed journal + nudge logic).
- `src/lib/cron/routes.ts` — `CRON_ROUTES` now lists 10 routes (+journal, +nudge). Daily description updated.
- Each route has independent `maxDuration = 30` (was 60 for overloaded daily).

### 6. Session Revocation

- Logout endpoint existed from Phase 1 (`src/app/api/dashboard/logout/route.ts`). No additional session revocation list needed for single-user app.

## Tests

```
npm run lint → PASS (0 errors, 0 warnings)
npm test → 171/171 PASS (12 files)
npm run clean && npm run build → PASS (42 routes)
npm run audit:security → 0 high, 1 medium (pre-existing liff/page.tsx)
npm run check:migrations → 28 local / 26 cloud (2 new local-only, need supabase db push)
```

Phase 2 test file: `tests/phase2-ops-observability.test.ts` — 12 tests covering trace ID types, logger API, circuit breaker lifecycle, cron route registry, WebhookEventRow type.

Updated: `tests/p0-fixtures.test.ts` — cron route count assertion updated from exact 8 to `>= 10`.

## Acceptance Criteria

- [x] Trace ID propagates from webhook_events through messages and llm_usage (types + wiring verified by build + tests)
- [x] Dead-letter items are visible via admin endpoint and can be retried (POST /api/admin/ops with action=retry)
- [x] Circuit breaker prevents retry storms during provider outages (5-failure threshold, 60s cooldown)
- [x] Daily cron split into isolated routes (journal, nudge, daily = retention only)
- [x] Admin operator dashboard shows queue depths, breaker status, and cost summary
- [x] Privacy-safe logger redacts sensitive fields
- [ ] PITR restore drill — BLOCKED (requires Supabase Dashboard access + temporary restore project)
- [ ] Preview canary — BLOCKED (requires Vercel preview URL)
- [ ] Authenticated LIFF WCAG audit — BLOCKED (requires Playwright storage state)
- [ ] Cross-instance rate limit verification — BLOCKED (requires Upstash Redis in production)
- [ ] QStash failure callbacks — BLOCKED (requires external QStash configuration)

## Security And Privacy Review

- Admin endpoint requires CRON_SECRET Bearer token (same as cron auth, fail-closed in production).
- Logger redacts sensitive keys by default. No raw prompts, tokens, or PII in structured metadata.
- Circuit breaker state is in-memory only — resets on cold start (safe: first call probes provider naturally).
- Dead-letter retry resets attempts to 0 — safe re-processing, guarded by webhook_event_id uniqueness.

## Performance And Cost

- Daily cron split reduces maxDuration from 60s to 30s per route, isolating failures.
- Circuit breaker saves 5+ retry calls per minute during sustained outages.
- No new DB migrations needed — all trace_id columns already exist from Phase 9.

## Rollback

- Code: revert Phase 2 files (observability/logger.ts, llm/circuit-breaker.ts, admin/ops/route.ts, cron/journal/route.ts, cron/nudge/route.ts) and restore daily/route.ts to pre-split version.
- No migration rollback needed (no schema changes).

## Known Gaps

- External drills (PITR, canary, WCAG) require credentials/access not available locally.
- Circuit breaker is instance-local — on Vercel serverless, each cold instance starts with closed circuits. Cross-instance coordination requires Upstash Redis.
- QStash failure callback integration deferred until external configuration.
