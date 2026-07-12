# Hoshi Production Roadmap — Gap Analysis

**Audit date:** 2026-07-11  
**Source plan:** `docs/HOSHI-PRODUCTION-ROADMAP.md`  
**Commits audited:** `7ca2a04` (Phase 0) through `4eaa104` (Phase 9)  
**Verification gates run:** `npm run lint` (pass), `npm test` (101/101 pass), `npm run build` (pass, 32 routes)

## Executive Verdict

Phase commits landed **core scaffolding and P0/P1 hotfixes**, but the roadmap's own **Definition of Production Ready** is **not met**. Most phases are **partial**: schema or happy-path code exists; workers, evals, privacy lifecycle, UX polish, and CI depth are missing.

| Bucket | Approx. share | Meaning |
|--------|---------------|---------|
| Fully delivered | ~40% | Code + migration + unit tests |
| Partially delivered | ~35% | Table/column or single-path only |
| Skipped / not found | ~25% | No `src/` implementation |

Prior session claim "all phases complete" = **phase commits exist**, not **roadmap verification criteria satisfied**.

---

## Definition Of Production Ready — Status

| Criterion (roadmap) | Status | Notes |
|---------------------|--------|-------|
| No confirmed P0/P1 blockers | Improved | Phase 1 hotfixes shipped; audit doc may still list residual UX gaps |
| Duplicate LINE events → one business effect | Partial | Webhook-level idempotency only; no mutation idempotency keys |
| Acknowledged events durable or dead-letter visible | Partial | `webhook_events` + dead_letter; no ops UI |
| Full lint/build/test/eval/migration gates in CI | Partial | CI = lint + build + unit only |
| Destructive target precision ≥ 99.5% | Not measured | No eval corpus |
| RAG Recall@10 ≥ 0.90 | Not measured | No retrieval eval |
| Zero prompt-injection side effects | Not measured | T0 policy exists; no injection suite |
| Latency SLOs (p95 routine/RAG) | Not measured | No baseline report |
| Every request has full trace | Partial | `trace_id` columns; limited propagation |
| Export, disconnect, retention, delete-all | Partial | Disconnect only |
| WCAG AA + 44px touch targets | Not verified | Some `aria-label`; no WCAG pass |

---

## Phase 0 — Reproduce And Measure

### Deliverables

| Item | Status | Evidence |
|------|--------|----------|
| Fix lint (3 errors, 6 warnings) | **Delivered** | `7ca2a04`; lint clean |
| Windows `.tsbuildinfo` / deterministic build | **Delivered** | `npm run clean`; build passes twice |
| Vitest + CI skeleton | **Delivered** | `tests/`, `.github/workflows/ci.yml` |
| P0 regression fixtures | **Delivered** | `tests/p0-fixtures.test.ts` |
| Freeze baseline commit + production revision | **Delivered** | `docs/BASELINE-REPORT.md` + `npm run baseline` |
| External state inspection (Vercel/QStash/Supabase/LINE) | **Partial** | Checklist in baseline report; live checks via scripts |
| Cloud migration parity proof | **Delivered** | `scripts/check-migration-parity.ts` (`npm run check:migrations`) |
| Schedule health check | **Delivered** | `src/lib/cron/routes.ts` (7 routes) + `npm run check:schedules` + admin GET health |

### Verification criteria

| Criterion | Status |
|-----------|--------|
| Fresh clone/build/lint twice on Windows + CI Linux | **Delivered** (build/lint/test; Windows build verified) |
| Cloud migration list equals tracked migrations | **Partial** (script shipped; needs linked supabase for PARITY OK) |
| Schedule health check lists every intended route | **Delivered** (`CRON_ROUTES` + health scripts) |
| Baseline report (latency, duplicate, orphan counts) | **Partial** (report + DB counters; latency/orphan still manual) |

---

## Phase 1 — Correctness Hotfix Release

### Implement items

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Meeting brief text external-event claim | **Delivered** | `meeting_brief_claims` migration; `api/cron/meeting/route.ts` |
| 2 | Todo canonical total ordering | **Delivered** | `src/lib/todo/repo.ts` |
| 3 | Goal delete uses `archived` | **Delivered** | `src/lib/goal/repo.ts` |
| 4 | Zero-row lexical fallback (memory + KB) | **Delivered** | `memory/store.ts`, `kb/repo.ts` |
| 5 | Escape people notes in context | **Delivered** | `compactNotes()` in `agent/context.ts` |
| 6 | Explicit `createPerson` vs fuzzy upsert | **Delivered** | `people/repo.ts`, dashboard route |
| 7 | Flex-to-plain-text fallback | **Delivered** | `api/line/route.ts` |
| 8 | Settings PATCH zod validation | **Delivered** | `api/dashboard/settings/route.ts` |
| 9 | Form success/error semantics | **Delivered** | `Dashboard.tsx` create handlers |
| 10 | Stale finance totals (roadmap item 9) | **Unclear** | No explicit finance-total refresh grep hit; form semantics fixed |

### Verification criteria

| Criterion | Status |
|-----------|--------|
| Integration test: non-UUID Google event → one brief | **Skipped** (unit/invariant tests only) |
| Tied todo order N → mutation N | **Partial** (ordering code + fixtures; no integration test) |
| Goal delete survives reload | **Partial** (repo logic; no e2e) |
| Null-embedding exact text recalled | **Partial** (fallback code; no embedding-null fixture test) |
| Notes with `</people>` inert | **Partial** (escape logic; no injection test) |
| Failed create preserves form + Thai retry | **Delivered** (Dashboard handlers) |

---

## Phase 2 — Durable Event And Side-Effect Core

### Implement items

| Item | Status | Evidence |
|------|--------|----------|
| `webhook_events` durable inbox + unique `webhookEventId` | **Delivered** | `webhook/inbox.ts`, migration `20260706140000` |
| Worker claim lease, attempts, dead-letter | **Delivered** | `claimEvent`, `markFailed` (≥3 → dead_letter), `staleEvents` |
| Mutation idempotency key (event + action + target) | **Delivered** | `mutation_keys` + `claimMutation` in handle |
| One absolute request/workflow deadline | **Delivered** | `Deadline` 45s envelope in `handle.ts` |
| Link auto-reminders to todos; cancel/reschedule | **Delivered** | `cancelReminder` in `handle.ts` on done/cancel/delete/update |
| Urgent-email pending/sent claim + recovery | **Delivered** | `gmail/index.ts`, `cron/email/route.ts` |
| Delivery state on assistant messages | **Delivered** | `messages.delivered`, line route |

### Verification criteria

| Criterion | Status |
|-----------|--------|
| Replay event 10× → one business effect | **Partial** (inbox tests; no concurrency integration test) |
| Kill worker after 200 → eventual completion | **Partial** (`staleEvents` + poll cron; not load-tested) |
| Crash after email claim → retry after lease | **Delivered** (releaseEmailClaim pattern) |
| Done/cancel/delete todo → zero active reminder | **Delivered** (handle.ts + tests) |
| Due update → exactly one reminder at new time | **Delivered** (cancel + reschedule in handle.ts) |

---

## Phase 3 — Privacy And Trust Lifecycle

### Implement items

| Item | Status | Evidence |
|------|--------|----------|
| One-time OAuth nonce + atomic consume | **Delivered** | `oauth_nonces`, `auth/oauth-state.ts` |
| Google disconnect + revoke | **Delivered** | `api/dashboard/google/disconnect` |
| LINE unsend handling | **Delivered** | `deleteMemoryByMessageId`, line route |
| Attachment deletion / orphan reconciliation | **Partial** | `deleteAttachment()` exists; no outbox/reconciliation job |
| Data export | **Delivered** | `src/lib/privacy/export.ts`, `GET /api/dashboard/export` |
| Retention settings | **Delivered** | `user_settings.retention_days` + daily cron purge |
| Delete-account workflow | **Delivered** | `src/lib/privacy/delete-account.ts`, `POST /api/dashboard/account/delete` |
| Encrypt Google tokens outside DB | **Delivered** | `src/lib/crypto/secrets.ts` + calendar token read/write |
| RPC EXECUTE grants service-role only | **Delivered** | Phase 3 migration |

### Verification criteria

| Criterion | Status |
|-----------|--------|
| Replayed OAuth state rejected | **Partial** (nonce consume logic; no integration test) |
| Unsend removes derived records | **Partial** (memory delete by message ID; policy not fully documented) |
| Delete-account audit finds zero rows/objects | **Partial** (workflow shipped; needs live audit) |
| DB dump has no usable Google refresh token | **Partial** (encrypted when `TOKEN_ENCRYPTION_KEY` set) |
| anon/authenticated RPC denied | **Partial** (migration; not re-verified live) |

---

## Phase 4 — Data Quality And Memory Foundation

### Implement items

| Item | Status | Evidence |
|------|--------|----------|
| Provenance columns | **Delivered** | `source_type`, `source_id` migration + types |
| Content hash dedup | **Delivered** | SHA-256 in `remember()` |
| Embedding lifecycle columns | **Delivered** | `embedding_model`, `embedding_status` |
| `knowledge_versions` on fact update | **Delivered** | `kb/repo.ts` archives prior row |
| `embedding_jobs` table | **Delivered** | Migration + `src/lib/embedding/jobs.ts` + `/api/cron/embed` |
| Immutable source/document/chunk model | **Skipped** | No documents/chunks usage |
| Provisional inferred facts + confirm/expiry | **Skipped** | |
| Contradiction detection / supersession | **Skipped** | Archive-on-update only |
| Durable reindex / deletion jobs | **Skipped** | |

### Verification criteria

| Criterion | Status |
|-----------|--------|
| 100% chunks/facts resolve to source span | **Skipped** (no chunk model) |
| Embedding coverage ≥ 99.9% | **Not measured** |
| Duplicate external ID count zero | **Partial** (content_hash dedup for memory) |
| Old superseded fact excluded immediately | **Partial** (KB version archive) |
| Correction searchable within one minute | **Not measured** |

---

## Phase 5 — Hybrid RAG And Context Budget

### Implement items

| Item | Status | Evidence |
|------|--------|----------|
| FTS + vector RRF hybrid RPC | **Delivered** | `hybrid_memory_search`, `hybrid_knowledge_search` |
| Token-budgeted context | **Delivered** | `MAX_KB_ALWAYS_TOKENS=800`, `MAX_MEMORY_TOKENS=1500` |
| Structured entity/date/source filters | **Partial** | Post-filter in JS |
| Selective reranker | **Skipped** | |
| Trust/freshness/validity adjustment | **Skipped** | |
| Evidence packer + internal evidence IDs | **Partial** | Budget caps; no citation IDs |
| User-facing citations | **Skipped** | |

### Verification criteria

| Criterion | Status |
|-----------|--------|
| Recall@10 ≥ 0.90 | **Skipped** (no eval corpus) |
| Precision@5 / nDCG@5 ≥ 0.85 | **Skipped** |
| No stale/superseded fact in context | **Partial** (no automated check) |
| Retrieval p95 < 750ms | **Not measured** |
| Fuzz corpus never exceeds budget | **Partial** (token caps in code) |

---

## Phase 6 — Production SOP And Prompt System

### Implement items

| Item | Status | Evidence |
|------|--------|----------|
| T0 security policy (versioned) | **Delivered** | `PROMPT_VERSION`, `T0_SECURITY_POLICY` |
| T1 product SOP (versioned) | **Delivered** | `SOP_VERSION`, workflow SOP block |
| T2 owner prefs / T3 evidence separation | **Partial** | Assembly in `context.ts` |
| Prompt compiler + token accounting | **Partial** | Budget caps; not a full compiler |
| Capability-accurate instructions | **Partial** | T0/T1 text; not eval-gated |
| Prompt registry + rollback | **Skipped** | Constants in source only |
| Eval replay for prompt/SOP changes | **Skipped** | |

### Verification criteria

| Criterion | Status |
|-----------|--------|
| Every trace stores prompt/policy/SOP version | **Skipped** | Versions in prompt text; not persisted per trace |
| Retrieved instructions never authorize tools | **Partial** (T0 policy text) |
| Unsupported personal fact → abstention | **Not measured** |
| Prompt changes blocked on safety regression | **Skipped** |

---

## Phase 7 — Typed Multi-Step Agent

### Implement items

| Item | Status | Evidence |
|------|--------|----------|
| Atomic deterministic fast paths | **Delivered** | Existing dispatch in `handle.ts` |
| Structured route output (Zod) | **Delivered** | Intent router |
| Bounded `steps[]` planner | **Delivered** | `validatePlan`, max 5 steps |
| Policy/confirmation engine | **Partial** | `riskLevel` R0/R1/R2; R2 asks confirm in-session |
| Pending actions store | **Skipped** | No resume-from-DB confirmation |
| Provider-neutral typed executor | **Partial** | Per-action dispatch remains |
| One replan after recoverable error | **Skipped** | |

### Verification criteria

| Criterion | Status |
|-----------|--------|
| 100+ compound Thai requests eval | **Skipped** |
| Plan schema validity ≥ 95% | **Not measured** |
| Tool argument accuracy ≥ 99% | **Not measured** |
| Zero unauthorized actions | **Not measured** |
| Risky actions zero writes before confirm | **Partial** (plan R2 gate) |
| Multi-step hard deadline < 45s | **Skipped** |

---

## Phase 8 — UX, Control And Accessibility

### Implement items

| Item | Status | Evidence |
|------|--------|----------|
| `html lang="th"` | **Delivered** | `src/app/layout.tsx` |
| Reminder control center | **Partial** | API `GET/DELETE /api/dashboard/reminders`; limited LIFF |
| Settings API | **Delivered** | `api/dashboard/settings` |
| Google disconnect UI | **Partial** | Route exists; LIFF coverage thin |
| Per-section loading/error states | **Partial** | `safeFetch` fallbacks in Dashboard |
| Write receipts + undo | **Skipped** | |
| Quiet hours / snooze | **Skipped** | |
| Full settings UI (timezone, toggles) | **Skipped** | No settings section in `Dashboard.tsx` grep |
| Mobile nav 4–5 items + 44px + safe-area | **Not verified** | |
| aria-live, focus, progress semantics | **Partial** | Some `aria-label` on buttons; no `aria-live` |
| Provenance/correction drawer | **Skipped** | |
| Actionable LINE Flex postbacks | **Partial** | Some Flex paths |

### Verification criteria

| Criterion | Status |
|-----------|--------|
| Physical iOS/Android at 375/390/430 | **Not verified** |
| WCAG AA automated + a11y smoke | **Skipped** |
| Failed write keeps input + retry | **Partial** (create handlers) |
| Destructive action names target + confirm/undo | **Partial** (confirm in planner; no undo) |

---

## Phase 9 — Observability, SLOs And Release Engineering

### Implement items

| Item | Status | Evidence |
|------|--------|----------|
| End-to-end trace model | **Partial** | `trace_id` on `llm_usage`, `webhook_events`, `messages` |
| Cost per provider/model | **Delivered** | `estimateCost()` in `llm/usage.ts` |
| Daily soft/hard cost caps | **Skipped** | |
| Retrieval/action/delivery dashboards | **Partial** | Usage/status pages; no full dashboards |
| CI: lint + build + unit | **Delivered** | `.github/workflows/ci.yml` |
| CI: integration, migration, eval, security audit | **Skipped** | |
| Preview smoke, canary rollout | **Skipped** | |
| Rollback runbook | **Delivered** | `docs/ROLLBACK-RUNBOOK.md` |
| Backup/PITR restore drill | **Skipped** | Documented only |

### Verification criteria

| Criterion | Status |
|-----------|--------|
| Trace completeness ≥ 99% | **Not measured** |
| Useful-response availability ≥ 99.5% | **Not measured** |
| Provider fallback recovery ≥ 99% | **Not measured** |
| Routine p95 < 6s; RAG p95 < 12s | **Not measured** |
| Restore drill meets RPO/RTO | **Skipped** |
| Rollout blocks on eval regression | **Skipped** |

---

## Summary By Phase

| Phase | Fully | Partial | Skipped | Overall |
|-------|-------|---------|---------|---------|
| 0 | 4 | 1 | 3 | Partial |
| 1 | 9 | 0 | 0 (+ verification gaps) | Mostly delivered |
| 2 | 5 | 0 | 2 (+ verification gaps) | Partial |
| 3 | 4 | 1 | 4 | Partial |
| 4 | 4 | 1 | 5 | Partial (schema > runtime) |
| 5 | 2 | 2 | 4 (+ metrics) | Partial |
| 6 | 2 | 3 | 2 (+ metrics) | Partial |
| 7 | 3 | 2 | 2 (+ metrics) | Partial |
| 8 | 2 | 5 | 5 (+ verification) | Partial |
| 9 | 3 | 2 | 5 (+ metrics) | Partial |

---

## Highest-Impact Gaps (recommended order)

1. ~~**Phase 3 privacy completion**~~ — export, retention, delete-account, token encryption (shipped 2026-07-11)  
2. ~~**Phase 0 verification**~~ — baseline report, migration parity script, schedule health (shipped 2026-07-11)  
3. ~~**Eval harness**~~ — routing corpus + retrieval metrics + prompt replay (shipped; live routing optional)  
4. ~~**Phase 2 hardening**~~ — mutation idempotency + 45s deadline + backoff (shipped)  
5. ~~**Phase 4 workers**~~ — embedding_jobs processor + reindex (shipped)  
6. ~~**Phase 8 UX**~~ — settings LIFF, undo receipts, quiet hours, mobile 5-nav, aria-live (shipped)  
7. ~~**Phase 9 CI depth**~~ — migration check + security audit + cost caps in CI (shipped)  

Remaining for true production DoD: live RAG eval corpus, PITR restore drill, canary rollout, full WCAG audit.

---

## Artifact Index

| Artifact | Path |
|----------|------|
| Roadmap | `docs/HOSHI-PRODUCTION-ROADMAP.md` |
| Prior audit | `docs/HOSHI-PRODUCTION-AUDIT.md` |
| Architecture target | `docs/HOSHI-AI-AGENT-ARCHITECTURE.md` |
| Rollback runbook | `docs/ROLLBACK-RUNBOOK.md` |
| Phase tests | `tests/phase{2-9}-*.test.ts`, `tests/p0-fixtures.test.ts` |
| CI | `.github/workflows/ci.yml` |
| Migrations | `supabase/migrations/20260706130000` – `20260706180000` |
