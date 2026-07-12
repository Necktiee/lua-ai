# Phase 11 — Production Hardening (Status Assessment)

Date: 2026-07-12
Owner: nextzus
Status: **Not certifiable from local environment**

## Summary

Phase 11 is the production-hardening phase. Most acceptance criteria require evidence from external services (Vercel deploys, Supabase cloud PITR, Upstash QStash schedules, Lighthouse CI, real device tests). Per `AGENTS.md`, these cannot be claimed from unit tests.

## Local evidence available

| Gate | Status | Notes |
|---|---|---|
| `npm run lint` | PASS | |
| `npm test` | PASS, 302 tests | |
| `npm run clean && npm run build` | PASS | 47 API routes + `/liff` |
| `npm run audit:security` | PASS | 0 high, 0 medium (resolved `liff/page.tsx` direct env read this session) |
| `npm run check:migrations` | **PASS** | 42 migrations match cloud (15 pushed this session: Phase 5/6/10 + cancel-status fix) |
| `npm run check:schedules` | BLOCKED | `QSTASH_TOKEN` unset locally |
| `npm run baseline` | PASS (local DB) | Not cloud |
| `npm run eval:routing` | BLOCKED | Requires external LLM pool |
| `npm run eval:rag` | BLOCKED | Requires external embeddings + cloud retrieval |

## Hardening surfaces present in codebase

- CI workflow `.github/workflows/ci.yml` runs lint/build/test/migration-parity/security/cron inventory.
- Cron workflow `.github/workflows/cron.yml` exists.
- Rollback runbook `docs/ROLLBACK-RUNBOOK.md` exists.
- Trace IDs + cost tracking (Phase 9).
- Mutation-idempotency flow across all writes.
- RLS on every table; service-role key used only server-side.
- `env.ts` centralization with production strict-mode rejection.

## Honest blockers (cannot resolve from this environment)

1. ~~**Cloud migration parity**~~ — **RESOLVED**: 15 migrations pushed via `supabase db push`. Trigger syntax fixed in 8 Phase 10 migrations (`touch_user_updated_at` → `touch_updated_at`, `before insert or update` → `before update`, removed invalid `CREATE TRIGGER IF NOT EXISTS`).
2. **QStash schedule deployment** — needs `QSTASH_TOKEN` and `APP_BASE_URL` reachable from cloud.
3. **Eval gate evidence** — `npm run eval:routing` / `eval:rag` need configured LLM pool + cloud retrieval RPCs.
4. **Smoke / canary evidence** — needs production deploy.
5. **WCAG / device test evidence** — needs Lighthouse CI + device farm runs.
6. **PITR / backup evidence** — needs Supabate cloud project settings verification.
7. ~~**LIFF direct `process.env` medium finding**~~ — **RESOLVED**: `src/app/liff/page.tsx` split into server `page.tsx` (imports `env.LIFF_ID`) + client `LiffApp.tsx` (accepts `liffId` prop).

## Recommendation

Phase 11 cannot be marked complete without a cloud deploy + external evidence capture. The next concrete deploy step is:

1. ~~`supabase link --project-ref <ref>` then `supabase db push` to apply the 9 pending migrations.~~ **Done** — 42/42 parity.
2. Configure `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `APP_BASE_URL`, Google OAuth creds in Vercel.
3. Push to `master` to trigger CI; verify all gates pass.
4. Run `npm run baseline`, `npm run eval:routing`, `npm run eval:rag` against the cloud project.
5. Run smoke scripts + capture Lighthouse / device test evidence.
6. ~~Fix the `liff/page.tsx:24` medium finding.~~ **Done.**

Until those happen, Phase 11 stays **uncertified**.
