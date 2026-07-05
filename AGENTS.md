<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

Next.js 16.2.10 with breaking changes. APIs, conventions, and file structure may differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# เลขา (lua-ai) — Agent Guide

Single-user Thai LINE AI secretary. Next.js App Router + Supabase + multi-provider LLM pool. Deployed at `https://lua-ai-two.vercel.app`, GitHub `Necktiee/lua-ai`, Supabase cloud `wepadghmipodyucqeulm`.

## Commands

```bash
npm run dev       # dev server (needs cloudflared tunnel for LINE webhook)
npm run build     # type-check + build (run before commits; this is the source of truth)
npm run lint      # eslint (flat config, eslint.config.mjs)
npx tsx scripts/smoke-llm.ts      # verify LLM keys + pool
npx tsx scripts/smoke-memory.ts   # store + recall round-trip (Supabase required)
npx tsx scripts/smoke-agent.ts    # full intent dispatch (Supabase + LLM required)
```

No test runner. Verify changes via `npm run build` + smoke scripts. Build MUST pass — it's the type-check gate.

## Supabase

- Local: `supabase start` then `supabase db reset` to apply all migrations.
- Cloud: `supabase link --project-ref <ref>` then `supabase db push` to apply.
- 9 migrations in `supabase/migrations/` (init schema, `match_memory` RPC, audit fixes, phase1 feature tables, nudge RPC, tags column, dedup unique).
- Schema owns: `users`, `memory` (pgvector 1024d + tags), `todos`, `reminders`, `calendar_events`, `messages`, `google_tokens`, `people`, `people_mentions`, `follow_ups`, `expenses`, `subscriptions`, `goals`, `goal_logs`, `journal_entries`, `relations`, `user_settings`.
- RLS enabled on all tables but app uses **service role key** (bypasses RLS). Policies use `nullif(current_setting('app.user_id', true), '')` as defense-in-depth.
- **Never use PostgREST `.or()` with interpolated user input** — it's filter injection. Use parameterized `.ilike()` + `escapePostgresString()`. See `src/lib/people/repo.ts`.
- Atomic counters need a SQL RPC (`increment_nudge`); JS read-then-write has TOCTOU race.

## Architecture

```
LINE webhook → src/app/api/line/route.ts
  → after() (reply 200 first, process async — LINE 1s timeout)
  → startLoadingAnimation(userId) before slow work
  → handle() in src/lib/agent/handle.ts
    → classify() LLM intent router (28 actions)
    → dispatch switch → calls feature modules
    → logMessage() both user + assistant turns
```

- **Intent router** (`src/lib/intent/router.ts`): LLM-lite classifier returning `{action, text, query?, index?, raw}`. All 28 `Action` types must be added to both the union AND `validAction()` array, else classify falls back to `chat`.
- **Memory** (`src/lib/memory/store.ts`): `remember()` accepts `tags?: string[]` (auto-detected: decision/expense/receipt/travel). `recall()` accepts `RecallFilters { tag?, startDate?, endDate? }` — post-filters RPC results in JS (RPC doesn't support these).
- **`match_memory` RPC**: cosine search via pgvector HNSW (cosine). Returns `tags` column. Changing return signature requires DROP + CREATE FUNCTION, not `CREATE OR REPLACE`.
- **LLM pool** (`src/lib/llm/pool.ts`): round-robin keys per provider, cross-provider fallback. Treats **403 as retryable** (Gemini quota). Strips `<think>/<thinking>/<reasoning>/<reflection>` tags. Lite model for intent classify.
- **Embeddings**: `baai/bge-m3` via OpenRouter (1024 dim). Mistral-embed deprecated (zero vectors). Gemini embedding needs 3072 dim (over HNSW limit).
- **ThaiLLM** is NOT OpenAI-compatible — excluded from `LLM_FALLBACK_ORDER` by default, needs LiteLLM proxy.

## Cron routes (7 total)

All cron routes use `authorizeCron(req)` (`src/lib/cron/auth.ts`) — **fail-closed in production** (503 if no `CRON_SECRET`).

| Route | Purpose |
|---|---|
| `/api/cron/poll` | Reminder fallback (every minute) |
| `/api/cron/remind` | QStash callback (signature verified) |
| `/api/cron/briefing` | Morning briefing (per-user local time) |
| `/api/cron/evening` | Evening review (per-user local time) |
| `/api/cron/daily` | Journal @22:00 + follow-up nudge @09:00 |
| `/api/cron/meeting` | Pre-meeting brief (25-35 min before event) |

- Cron send dedup via `src/lib/cron/dedup.ts`: uses `reminders` table as sent-log with synthetic markers `__kind__:YYYY-MM-DD`. `recordSentToday` claims atomically, `clearSentToday` rolls back on push failure.
- Cron routes respect `LINE_USER_WHITELIST` via `filterAllowed()`.

## Timezone

All day boundaries computed in user's timezone (`user_settings.timezone`, default `Asia/Bangkok`). Use helpers in `src/lib/tz.ts`:
- `localDateStr(date, tz)` — YYYY-MM-DD in tz
- `localHHMM(date, tz)` — HH:MM in tz
- `localDayBounds(date, tz)` — UTC ISO bounds for DB queries
- `BANGKOK` constant = `"Asia/Bangkok"`

**Never** use `new Date().getHours()` for user-facing time logic — it's server-local, wrong on Vercel.

## Env

Validated in `src/lib/env.ts` via zod. **Import env from there, never read `process.env` directly.** Dev mode uses typed `fallbackDefaults` (won't crash on missing keys, only warns). Production throws on invalid.

- `APP_BASE_URL` must be the public URL (tunnel in dev, Vercel domain in prod) — needed for QStash callbacks + Google OAuth redirect.
- `LINE_USER_WHITELIST` is comma-separated LINE userIds — if empty, all users allowed.
- `QSTASH_TOKEN` + `QSTASH_CURRENT_SIGNING_KEY` + `QSTASH_NEXT_SIGNING_KEY` all three needed for QStash. Without them, reminders rely on `/api/cron/poll` fallback.
- `GEMINI_API_KEYS` / `MISTRAL_API_KEYS` / `THAILLM_API_KEYS` / `OPENROUTER_API_KEYS` are comma-separated multi-key pools.

## Conventions

- **Dynamic imports** for optional features (storage, multimodal, people, briefing, etc.) in `handle.ts` dispatch — keeps cold start fast, avoids loading unused code.
- **Background fire-and-forget** for non-critical work (e.g., people extraction after remember): `.catch(console.warn)` pattern.
- `touchUser(userId)` must be called before any DB insert with FK to `users` table.
- IDs via Postgres `gen_random_uuid()`, not nanoid (columns are uuid type).
- LINE text limit 5000 chars — `replyText` slices automatically.
- Google OAuth state is HMAC-signed (`src/lib/auth/oauth-state.ts`), 10min TTL, uses `LINE_CHANNEL_SECRET` or `CRON_SECRET` as key.
- `googleapis` is in `serverExternalPackages` (next.config.ts) — don't bundle.

## Deploy

GitHub push auto-deploys via Vercel. Env vars set via `vercel env add <name> production --value <val> --yes --force`. After changing `APP_BASE_URL`, redeploy. After Supabase schema change: `supabase db push`.

## Don't

- Don't commit `.env.local` (gitignored). Only `.env.example` is tracked.
- Don't use `.or()` with unsanitized strings in supabase-js queries.
- Don't use `new Date().getHours()` for user time — use `src/lib/tz.ts`.
- Don't add comments unless asked (per global instruction).
- Don't skip `npm run build` before considering work done.
