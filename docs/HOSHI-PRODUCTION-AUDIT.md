# Hoshi Production Audit

วันที่ตรวจ: 11 กรกฎาคม 2026

## Improved Project Brief

ตรวจสอบ Hoshi จาก source code, schema, routes, build gates และเอกสารทางการ แล้วออกแบบแผนยกระดับเป็น AI secretary ระดับ production ที่:

- ถูกต้องและไม่แก้ข้อมูลผิดรายการ
- ทนต่อ webhook ซ้ำ, provider ล่ม, timeout และ worker ถูกตัด
- ใช้ข้อมูลส่วนตัวอย่างปลอดภัย มี provenance, retention และ deletion lifecycle
- ฉลาดจาก KB/RAG/SOP ที่มีคุณภาพ ไม่ใช่ยัด context ให้เยอะที่สุด
- ทำงานหลายขั้นตอนได้แบบ bounded, typed และตรวจสอบได้
- มี evals, traces, SLOs และ rollback gates ก่อนเปลี่ยน prompt/model/schema
- ใช้ได้จริงผ่าน LINE และ LIFF บนมือถือ

หลักสำคัญ: **garbage in, garbage out**. ห้ามเพิ่ม autonomy ก่อน ingestion, retrieval, validation, idempotency และ evaluation เชื่อถือได้

## Executive Verdict

Hoshi มี feature breadth สูงและฐานสถาปัตยกรรมที่ดี แต่ยังเป็น controlled beta ไม่ใช่ high-trust production agent

จุดแข็ง:

- LINE signature, signed LIFF session, whitelist และ canonical owner มี defense หลายชั้น
- Intent classifier แยกจาก deterministic dispatch; mutation ส่วนใหญ่ scope ด้วย `user_id`
- Memory และ Knowledge แยก episodic/semantic ชัดเจน
- RAG ใช้ shared embedding, similarity floor และ safe ILIKE fallback
- Cron/reminder หลายเส้นทางใช้ atomic claim + rollback
- LLM pool มี timeout, provider fallback และ usage tracking
- LIFF ครอบคลุมงาน, คน, KB, การเงิน, เป้าหมาย และ memory

สิ่งที่ยังไม่ผ่าน production gate:

- มี P0/P1 correctness bugs ที่ทำงานผิดรายการหรือทำให้ feature ไม่ทำงาน
- Webhook acknowledge ก่อน durable persistence และไม่มี event idempotency
- ไม่มี automated test runner/CI; full lint ไม่ผ่าน
- ไม่มี retrieval/prompt/tool eval corpus และ end-to-end traces
- KB/RAG ยังไม่มี provenance/version/contradiction/chunking/hybrid retrieval/token budget
- One-action router ทำ compound request หาย และ prompt บอกให้ agent ลงมือได้มากกว่าที่ executor ทำจริง

## Verified Baseline

- Stack: Next.js `16.2.10`, React `19.2.4`, Supabase, pgvector 1024d, LINE, QStash, Google APIs, multi-provider OpenAI-compatible LLM pool
- Surface: 28 API routes, 51 `src/lib` modules, 15 migrations, 12 smoke/debug scripts
- Git worktree: clean at audit start
- `npm run lint`: FAIL, 3 errors in `scripts/probe.ts`, 6 warnings
- `npm run build`: compile succeeded but TypeScript worker failed twice on Windows path normalization for `.next/cache/.tsbuildinfo`
- `npm audit --omit=dev`: 2 moderate findings through Next.js nested PostCSS; no demonstrated runtime attacker-controlled CSS path; do not use audit's invalid downgrade to Next 9.3.3
- No tracked `.github/workflows/*` and no `vercel.json`
- `package.json` has no unit/integration/e2e test script

## Confirmed P0 Blockers

### P0-1 Meeting brief cron cannot claim normal Google events

Evidence:

- `src/lib/meeting/prep.ts:131-156` maps `event.id` directly from Google Calendar
- `src/app/api/cron/meeting/route.ts:69-82` inserts that value into `relations.from_id` and `to_id`
- `supabase/migrations/20260705070000_phase1_tables.sql:147-155` defines both columns as UUID

Google event IDs are text identifiers, normally not UUIDs. Insert fails before brief generation; unique index does not help because the row cannot be inserted

Gate:

- Use a dedicated external-event claim table with text ID or a text claim key
- Two overlapping cron workers with one non-UUID Google event must send exactly once
- Failed generation/push must release or expire the claim

### P0-2 Todo ordinal target is not stable

Evidence:

- `src/lib/todo/repo.ts:37-49` list order: `priority`, `due_at`
- `src/lib/todo/repo.ts:149-165` mutation lookup uses the same partial ordering without a deterministic tie-breaker
- `src/lib/agent/handle.ts:174-185` defaults missing index to item 1

Equal priority and null/equal due dates can reorder. “เสร็จแล้ว” with multiple tasks can silently mutate task 1

Gate:

- Add total order: `priority`, `due_at`, `created_at`, `id`
- List and mutation must share one canonical ordering function/query
- Missing index with multiple pending tasks always asks; never defaults to 1
- Tie-order replay test must resolve the same ID 1,000 times

### P0-3 Webhook processing is neither durable nor idempotent

Evidence:

- `src/app/api/line/route.ts:30-40` omits `webhookEventId`
- `src/app/api/line/route.ts:48-149` returns 200 and relies only on `after()` bounded by `maxDuration=60`

Worker termination loses acknowledged events. Redelivery can duplicate todos, reminders, expenses, memory, calendar entries and messages

Gate:

- Persist raw event and unique `webhookEventId` before returning 200
- Durable inbox state: pending/processing/done/failed, attempts, lease, error
- Replay identical payload 10 times and produce exactly one mutation set and one delivery
- Kill worker after acknowledgment and prove eventual processing

### P0-4 No production regression gate

Evidence:

- `package.json` has build/lint only
- Full lint currently fails
- Smoke scripts are manual and mostly happy-path
- No CI workflow exists

Gate:

- Green lint, deterministic build, unit/integration/e2e scripts and CI
- Block deployment on P0 safety regressions, schema mismatch, migration failure and eval regression

## Confirmed P1 Bugs And Risks

| ID | Finding | Evidence | Required outcome |
|---|---|---|---|
| P1-1 | Goal delete always fails | `src/lib/goal/repo.ts:46-64` writes `cancelled`; schema permits only active/paused/done/archived | Use `archived` or intentional migration; delete succeeds after reload |
| P1-2 | Vector search returning zero rows skips text fallback | `memory/store.ts:129-138`, `kb/repo.ts:191-196` fallback only when `results.length > 0` | Empty vector result must run lexical fallback |
| P1-3 | Urgent email marked processed before memory/push | `gmail/index.ts:264-305`, `cron/email/route.ts:62-81` | Atomic claim; finalize after delivery; release/lease on failure |
| P1-4 | Attachment deletion leaves private blob | `storage.ts:30-44`, `memory/store.ts:183-191` | Delete DB + object via durable cleanup; reconcile orphans |
| P1-5 | Person explicit create can merge partial name | `people/repo.ts:31-41`, dashboard POST uses `upsertPerson` | Create uses exact normalized identity; partial match requires choice |
| P1-6 | People notes are not XML escaped | `agent/context.ts` `compactNotes()` then `formatPeople()` | Escape all retrieved values and label trust/provenance |
| P1-7 | Todo reminder not linked to todo | `handle.ts:138-158` creates reminder without relation | Done/cancel/delete removes reminder; due update reschedules exactly one |
| P1-8 | Timeout applies per provider/key attempt, not request | `llm/pool.ts` retry loop | One absolute deadline propagated through all stages |
| P1-9 | Classifier failure escapes normal fallback | `handle.ts` calls `classify()` before dispatch catch | Deterministic degradation; useful response within deadline |
| P1-10 | Settings PATCH accepts invalid timezone/types | `api/dashboard/settings/route.ts:17-46` | Zod validation for IANA timezone, HH:mm, booleans and ranges |
| P1-11 | Schedule installer omits weekly/email | `api/admin/setup-schedules/route.ts:25-34` | Installer and health check cover every intended cron |
| P1-12 | OAuth state is reusable and not session-bound | `auth/oauth-state.ts` | One-time nonce, initiating-session binding, atomic consume |
| P1-13 | LINE content host/size handling unsafe | `line.ts:10,148-164` | Use documented content host; pre-buffer size limit; bounded memory |
| P1-14 | Flex failure retries same invalid Flex | `api/line/route.ts:124-134` | Fall back to stored plain text after Flex reply/push failure |
| P1-15 | Compound request loses all but one action | `intent/router.ts` requires ONE action | Typed bounded `steps[]` plan, max 3-5, deterministic executor |

## Product And UX Gaps

### P1

- Dashboard `safeFetch` maps API failure to empty data; users cannot distinguish empty/offline/unauthorized/error
- Create forms often clear input before confirmed 2xx and lack Thai error/retry feedback
- Mobile bottom nav has nine equal destinations; touch targets are below 44px on common phones
- `html lang="en"` despite Thai-first UI; labels, progress semantics, focus and `aria-live` incomplete
- No LIFF reminder management or proactive-control center despite reminders being core feature
- No settings UI for timezone, briefing/review times, toggles, quiet hours and follow-up cadence
- Journal is AI-generated but presented without clear provenance/approval
- Help copy overclaims automatic text memory and relationship-tier effects
- Google consent does not clearly explain Calendar write + Gmail read scope or revocation
- No logout, Google disconnect, export, retention or delete-all privacy center

### P2

- Finance supports delete but not correcting amount/category/date
- Goals support create/delete but not dashboard progress logging/edit
- Follow-ups cannot be created/reopened/edited in LIFF
- Memory has no search, provenance drawer, original artifact view or retention controls
- LINE Flex summaries lack postback actions for completing tasks/closing follow-ups

## Security Findings That Are Not Bugs

- No dashboard IDOR found: routes use `requireSessionUser()` and mutations generally scope by `user_id` + `id`
- No interpolated PostgREST `.or()` injection found in audited search paths
- RPCs are invoker functions, so no demonstrated RLS bypass; still revoke default PUBLIC/anon/authenticated EXECUTE and grant service role explicitly
- Gmail `email_reply` only drafts text; it does not send email
- Calendar create has no attendees/sendUpdates, so it does not notify external parties

## Current Readiness Scorecard

| Dimension | Status | Reason |
|---|---|---|
| Feature breadth | Strong | Core secretary workflows exist |
| Correctness | Blocked | P0/P1 wrong-target/schema/type bugs |
| Reliability | Blocked | No durable webhook inbox/idempotency |
| Security | Beta | Good auth base; OAuth nonce, retention and token protection gaps |
| Agent intelligence | Beta | Good context layers; one-action and capability mismatch |
| KB/RAG quality | Prototype+ | Dense retrieval works; no hybrid/provenance/version/evals |
| UX | Beta | Broad LIFF, weak errors/mobile/accessibility/control center |
| Observability | Prototype | Call usage only; no end-to-end trace |
| Testing/CI | Blocked | No test runner/CI; lint/build not green |
| Operations | Beta | Cron patterns strong; installer incomplete, no SLO/runbook/DR proof |

## Audit Boundaries

Not inspected dynamically:

- Production env values, Vercel plan/runtime logs and deployed revision
- QStash schedule list and webhook redelivery settings
- Cloud schema/grants/index health, query plans, row counts and null embedding rate
- Supabase Storage policies/orphan count/backups/PITR
- Live LINE/LIFF/Google flows and physical mobile accessibility
- Real provider latency/cost/quality distributions

These are explicit Phase 0 production-verification tasks in the roadmap, not assumed green

## Authoritative Sources

- Anthropic, Building Effective Agents and prompt-evaluation/tool-use courses
- Supabase, Hybrid Search with full-text + vector + Reciprocal Rank Fusion
- pgvector, HNSW filtered-search guidance
- OpenAI, structured outputs, agent traces and evals
- OWASP GenAI LLM01 Prompt Injection
- LINE Messaging API webhook/redelivery/content documentation
- Next.js `after()` documentation
- NIST AI RMF Generative AI Profile
