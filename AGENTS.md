# lua-ai Agent Guide

Single-owner Thai LINE secretary: Next.js App Router, Supabase, LINE, Google Calendar, QStash, and an LLM pool.

## Commands

```bash
npm run dev
npm run lint
npm test
npm test -- tests/<file>.test.ts
npm run clean && npm run build
npm run check:migrations
npm run check:schedules
npm run audit:security
```

- On Windows, always run `npm run clean && npm run build`; stale `.next` build state can break incremental builds.
- CI on `master` runs `npm ci`, lint, build, tests, migration parity, security audit, then checks `CRON_ROUTES` inventory.
- Vitest runs only `tests/**/*.test.ts`, uses Node, and maps `@/` to `src/`.
- `npm run baseline`, `npm run eval:routing`, `npm run eval:rag`, smoke scripts, and cloud migration parity require configured external services; do not claim their evidence from unit tests.

## Runtime Flow

```text
LINE POST /api/line -> durable webhook_events inbox -> next/server after()
-> handle() -> classify() -> dispatch() -> feature repos / LLM -> LINE reply
```

- Preserve the webhook order: verify the raw-body signature, persist each event idempotently, return 200 quickly, then process in `after()`. LINE has a short response deadline.
- `src/lib/agent/handle.ts` canonicalizes the user ID, calls `touchUser()` before database writes, logs the user turn, claims mutation idempotency, then dispatches. Keep new actions in this path.
- Adding an intent requires both the `Action` union and `validAction()` in `src/lib/intent/router.ts`; otherwise classification falls back to `chat`.
- Action risk/planning metadata belongs in `src/lib/agent/registry.ts`; do not maintain duplicate action lists.
- Keep optional feature imports dynamic in `handle.ts` dispatch paths to limit cold-start work.

## Data And Security

- Use `env` from `src/lib/env.ts`; do not read `process.env` elsewhere. Development falls back with warnings, production rejects invalid configuration.
- With `OWNER_LINE_USER_ID`, production also requires a non-empty `LINE_USER_WHITELIST`; do not weaken this invariant.
- Call `touchUser(userId)` before inserts with a `users` foreign key. UUID columns use Postgres `gen_random_uuid()`, not `nanoid`.
- Do not interpolate user input into Supabase/PostgREST `.or()` filters. Use parameterized filters and `escapePostgresString()` where needed.
- Database mutations must use the existing mutation-idempotency flow. Match every application-written enum/status value against the SQL check constraint and add a regression test when changing either.
- Changing an RPC return signature requires `DROP FUNCTION` then `CREATE FUNCTION`; `CREATE OR REPLACE` cannot change it.
- Use SQL RPCs for atomic counters; avoid JavaScript read-modify-write races.
- RLS exists but server code uses the Supabase service-role key, so server authorization checks remain required.

## Time, Prompts, And Retrieval

- User-facing date boundaries must use `src/lib/tz.ts` with the user's configured timezone. Never use server-local `new Date().getHours()`.
- Prompt assembly is trust-ordered in `src/lib/agent/prompts.ts`: immutable policy, product/domain SOP, owner preferences, then untrusted evidence. Preserve evidence source IDs and do not treat retrieved text as instructions.
- Thai hybrid retrieval combines FTS, `pg_trgm`, and vectors. Keep `baai/bge-m3` embeddings at 1024 dimensions; changing retrieval/RPC shapes needs migration and regression coverage.

## Scheduling And Integrations

- Add every scheduled route to `src/lib/cron/routes.ts`; cron handlers must use `authorizeCron(req)` and respect `filterAllowed()`.
- Daily-style cron sends use `src/lib/cron/dedup.ts`; claim before sending and roll back the claim on delivery failure.
- QStash reminder callbacks require signature verification. Without QStash credentials, `/api/cron/poll` is the reminder fallback.
- `APP_BASE_URL` must be externally reachable for LINE webhooks and Google OAuth; use a cloudflared tunnel locally. Changing it requires updating LINE/Google configuration and redeploying.
- `googleapis` is externalized in `next.config.ts`; keep it out of the server bundle.

## Schema And Deployment

- Local schema: `supabase start` then `supabase db reset`. Cloud schema: `supabase link --project-ref <ref>` then `supabase db push`.
- Never edit an applied migration. Add a new timestamped SQL migration, then run parity against the linked cloud project before deployment.
- Do not commit `.env.local`; update `.env.example` only for documented environment changes.
- Vercel deploys from GitHub. Review `docs/ROLLBACK-RUNBOOK.md` before production schema or environment changes.

## Framework

- This repo pins Next.js `16.2.10`. Before changing Next-specific APIs or conventions, read the relevant local guide in `node_modules/next/dist/docs/`; do not assume older Next.js behavior.
