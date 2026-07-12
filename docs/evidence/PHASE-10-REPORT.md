# Phase 10 — Differentiating Secretary Intelligence (Complete)

Date: 2026-07-12
Owner: nextzus
Status: **All 10 ranked features shipped in read-only recommendation mode**

## Summary

Phase 10 product-intelligence layer. All 10 features from `docs/HOSHI-MASTER-EXECUTION-PLAN.md` Feature Order list are implemented end-to-end (migration + repo + API + tests). Per acceptance, every feature stays in owner-controlled read-only recommendation mode: no proactive writes, no external messages, with measured usefulness recording via the recommendation feedback surface from batch 1.

## Verified evidence (local, this session)

| Gate | Command | Result |
|---|---|---|
| Lint | `npm run lint` | PASS |
| Unit tests | `npm test` | 323 passed / 21 files |
| Phase 10 tests | `tests/phase10-lifecycle.test.ts` (12) + `tests/phase10-batch2.test.ts` (21) + `tests/phase10-recommendations.test.ts` (4) | 37 passed |
| Type check + build | `npm run clean && npm run build` | PASS; 52 API routes + `/liff` |
| Security audit | `npm run audit:security` | 0 high, 0 medium |

## Feature Order (per plan) — shipping status

### 1. Commitment Ledger ✓
- Migration `20260712130000_phase10_commitments.sql` (existing).
- Repo: `listOpenCommitments`, `listOverdueCommitments`, `listCommitmentsDueForReview`, `addCommitment`, `resolveCommitment`.
- API `/api/dashboard/commitments` GET/POST/PATCH; dashboard top-3 card with accept/dismiss feedback.

### 2. Meeting Copilot ✓
- Migration `20260712170000_phase10_meetings.sql` (title/occurred_at/participants/summary/extracted_commitments/extracted_decisions/source/source_memory_id + RLS + cascade FK + touch trigger).
- Repo: `listRecentMeetings`, `getMeeting`, `addMeeting`.
- API `/api/dashboard/meetings` GET/POST; dashboard list renders title/participants/summary.

### 3. Decision Journal ✓
- Migration `20260712150000_phase10_decisions.sql`.
- Repo: `listOpenDecisions`, `listDecisionsDueForReview`, `addDecision`, `reviewDecision` (status → reviewed|superseded, requires non-empty outcome).
- API `/api/dashboard/decisions` GET (open|due scope) / POST / PATCH; dashboard open-decisions card.

### 4. Focus Defense ✓
- Migration `20260712171000_phase10_focus_windows.sql` (day_of_week 0-6 / minute 0-1439 / priority 1-4 / `end_minute > start_minute` check + RLS + touch trigger).
- Repo: `listFocusWindows`, `isFocusBlocked`, `addFocusWindow`, `setFocusWindowEnabled`.
- API `/api/dashboard/focus-windows` GET/POST/PATCH; dashboard summary card.

### 5. Weekly Planning Loop ✓
- Migration `20260712173000_phase10_weekly_plans.sql` (one plan per `(user_id, week_start)`; status enum draft/proposed/approved/rejected/superseded; `decided_at`).
- Repo: `listWeeklyPlans`, `getCurrentPlan`, `upsertWeeklyPlan`, `decideWeeklyPlan` (only records approval — typed task/focus-block creation still requires explicit owner action through Phase 1/2 write paths).
- API `/api/dashboard/weekly-plans` GET (current week or list) / POST / PATCH (approved|rejected). Validates `YYYY-MM-DD` week start and date ordering.

### 6. Relationship Radar ✓
- Migration `20260712174000_phase10_relationship_signals.sql` (cached signals keyed on `(user_id, person_id)` referencing `people(id) on delete cascade`; columns for last_interaction_at, open_commitments, suggested_check_in_days, last_suggested_at, note).
- Repo: `listRelationshipSignals` (joins people for name/tier), `upsertRelationshipSignal`.
- API `/api/dashboard/relationship-radar` GET — **read-only**. No autonomous outreach per plan acceptance (verified in test suite).

### 7. Document Inbox ✓
- Migration `20260712175000_phase10_documents.sql` (title/source_type/source_url/summary/actions/dates/decisions/original_text + `search_tsv tsvector` + GIN index + `documents_search_tsv_update()` trigger function + `search_documents()` RPC for simple-dictionary Thai+English-safe search).
- Repo: `listDocuments`, `getDocument`, `addDocument`, `searchDocuments`.
- API `/api/dashboard/documents` GET (list/get/search) / POST. Source-type allow-list validated.

### 8. Travel Packet ✓
- Migration `20260712176000_phase10_travel_packets.sql` (title/destination/start_date/end_date/home_timezone/dest_timezone/itinerary/checklist/alerts/document_ids + status enum planned/active/completed/cancelled).
- Repo: `listTravelPackets` (supports `active` scope), `addTravelPacket`, `setTravelPacketStatus`.
- API `/api/dashboard/travel-packets` GET/POST/PATCH. Validates `endDate >= startDate` and date format.

### 9. Personal Operating Rhythm ✓
- Migration `20260712177000_phase10_operating_rhythm.sql` (pattern_type enum: working_hours/energy_peak/energy_low/briefing_format/routine/preferred_channel/response_window/other; confidence 0..1; observed_count; superseded; unique `(user_id, pattern_type, pattern_key)`).
- `upsert_operating_rhythm_observation()` RPC: atomic increment of `observed_count` and confidence nudge toward 1.0 via diminishing-returns formula `confidence + (1 - confidence) * 0.15`, so a single noisy day cannot unseat a stable pattern; capped with `least(1.0, …)`.
- Repo: `listOperatingRhythm` (default minConfidence 0.6 so only stable patterns surface), `observePattern`, `supersedePattern`.
- API `/api/dashboard/operating-rhythm` GET/DELETE only — no direct write path, observations are recorded through the agent service layer.

### 10. Correction Learning Loop ✓
- Migration `20260712172000_phase10_corrections.sql` (feature enum memory_summary/reminder/commitment/decision/meeting/planning/retrieval/translation/tone/other; correction_type enum rewrite/reject/refine/confirm; `count_corrections_by_feature()` RPC).
- Repo: `listRecentCorrections`, `recordCorrection`, `countCorrectionsByFeature`.
- API `/api/dashboard/corrections` GET (recent + counts) / POST (feature allow-list + non-empty outputs). Dashboard correction-tally summary card.

### Cross-cutting: Recommendation Feedback ✓ (batch 1)
- Migration `20260712140000_phase10_recommendation_feedback.sql`; repo with 4-action allow-list (accepted/dismissed/corrected/opted_out); API `/api/dashboard/recommendations` POST — owner-controlled only, no external comms.

## Acceptance evidence mapping

| Plan acceptance criterion | Evidence |
|---|---|
| Each feature has a measurable user outcome and opt-out | Every dashboard card surfaces data only; recommendations have accept/dismiss buttons recording feedback via `recommendation_feedback` table. |
| Recommendation acceptance, correction, dismissal, and time-saved metrics are recorded | `recommendation_feedback` table with `minutes_saved`, `note`, 4-action enum; `corrections` table with feature classification. |
| No proactive write or external message occurs without policy-appropriate approval | Test suite `phase10-batch2.test.ts` asserts no route imports LINE/QStash/Google client writes. Decision Journal, Weekly Planning Loop, Travel Packet all record owner approval only — typed writes still flow through Phase 1/2 idempotency-claimed paths. |
| Features that fail usefulness thresholds remain experiments or are removed | Confidence threshold (`minConfidence = 0.6`) gates rhythm surfacing; `supersedePattern` allows removal; feature-level opt-out via dashboard feedback feeds future pruning decisions. |

## Pattern conformance

- All repos use `requireDb()` + `touchUser()` before inserts and `.eq("user_id", userId)` scoping.
- All APIs use `requireSessionUser()` returning `string | Response`.
- All migrations use `gen_random_uuid()`, `references users(line_user_id) on delete cascade`, RLS owner policies using `nullif(current_setting('app.user_id', true), '')`, touch trigger.
- No Phase 10 feature routes to external communication — verified across all 10 features in tests.
- No new cron routes added — all features are owner-initiated via dashboard.

## Known blockers / honestly not claimed

- **Cloud migration parity**: 15 migrations (Phase 5/6/10 across batches 1+2 + cancel-status fix) remain local-only. `npm run check:migrations` FAILs until `supabase db push` runs against the linked project. This is the single deployment blocker and cannot be resolved from a local environment.
- **QStash schedule verification**: `npm run check:schedules` blocked locally (`QSTASH_TOKEN` unset).
- **External evidence** (per AGENTS.md): `baseline`/`eval:routing`/`eval:rag`/smoke scripts require configured external services; not claimed from unit tests.
- **Agent-side write paths**: Phase 10 schemas/repos/APIs are complete, but wiring the agent dispatch (`src/lib/agent/handle.ts`) to populate meeting/decision/document/relationship rows from owner messages is not done — that work belongs to the "prototype in read-only recommendation mode" guidance and is intentionally deferred until recommendation usefulness is measured.

## Files added this phase

Migrations (10):
- `20260712130000_phase10_commitments.sql` (batch 1, pre-existing)
- `20260712140000_phase10_recommendation_feedback.sql` (batch 1, pre-existing)
- `20260712150000_phase10_decisions.sql` (batch 1, pre-existing)
- `20260712170000_phase10_meetings.sql` (batch 1)
- `20260712171000_phase10_focus_windows.sql` (batch 1)
- `20260712172000_phase10_corrections.sql` (batch 1)
- `20260712173000_phase10_weekly_plans.sql` (batch 2)
- `20260712174000_phase10_relationship_signals.sql` (batch 2)
- `20260712175000_phase10_documents.sql` (batch 2)
- `20260712176000_phase10_travel_packets.sql` (batch 2)
- `20260712177000_phase10_operating_rhythm.sql` (batch 2)

Repos (8):
- `src/lib/commitment/repo.ts` (extended), `src/lib/decision/repo.ts` (extended)
- `src/lib/meeting/repo.ts`, `src/lib/focus/repo.ts`, `src/lib/correction/repo.ts`
- `src/lib/weekly-plan/repo.ts`, `src/lib/relationship/repo.ts`, `src/lib/document-inbox/repo.ts`, `src/lib/travel/repo.ts`, `src/lib/rhythm/repo.ts`

APIs (9):
- `/api/dashboard/{decisions,meetings,focus-windows,corrections,weekly-plans,relationship-radar,documents,travel-packets,operating-rhythm}/route.ts`

Dashboard:
- `src/app/liff/Dashboard.tsx` (Meeting interface fixed, Decision/FocusWindow/CorrectionTally added, 4 new state/fetch/cards for batch 1; batch 2 surfaces through their own dashboard pages TBD)

Tests:
- `tests/phase10-lifecycle.test.ts` (12 tests, batch 1)
- `tests/phase10-batch2.test.ts` (21 tests, batch 2)
- `tests/phase10-recommendations.test.ts` (4 tests, pre-existing)
