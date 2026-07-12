# Phase 4: Agent Core Modularization And Fast Routing

**Date:** 2026-07-12T11:05 UTC
**Status:** ✅ Complete

## Goal
Reduce latency and maintenance risk while preserving behavior by modularizing agent execution and adding evidence-backed deterministic fast paths.

## Deliverables

### 1. Action Registry (Single Source of Truth)
**File:** `src/lib/agent/registry.ts`

All action metadata (risk level, plannable flag, help category, help lines) is centralized in one registry. Derived lists:
- `ALL_ACTIONS` — all valid actions
- `PLANNABLE_ACTIONS` — actions allowed in multi-step plans
- `DESTRUCTIVE_ACTIONS` — R2 data-deleting actions
- `EXTERNAL_ACTIONS` — R2 external-commitment actions (calendar_add, email_reply)
- `PLANNABLE_WRITE_ACTIONS` — R1/R2 mutations
- `buildHelpSections()` — help menu generated from registry help lines

**Impact:** Adding a new action now requires exactly one registry entry + one dispatch case. No more syncing 5 separate hardcoded lists.

### 2. Planner Derived from Registry
**File:** `src/lib/agent/planner.ts`

`PLANNABLE_ACTIONS`, `DESTRUCTIVE_ACTIONS`, and `EXTERNAL_ACTIONS` are now re-exported from the registry. The `riskLevel()` function uses registry-derived sets. No more duplicated action lists between planner and registry.

### 3. Router Delegates to Registry
**File:** `src/lib/intent/router.ts`

`validAction()` delegates to `registry.isValidAction()` for feature actions, with special-case handling for `plan`, `chat`, `help` meta-actions.

### 4. Fast-Path Router
**File:** `src/lib/intent/fast-path.ts`

14 deterministic regex patterns for high-precision commands. Checked BEFORE the LLM classifier call. Saves ~1-2s latency and one LLM API call for obvious commands.

Patterns cover: help, todo_list, followup_list, subscription_list, remind_list, expense_summary, expense_list, goal_progress, journal_show, calendar_list, briefing, evening_review.

**Thai regex note:** `\b` word boundaries don't work with Thai characters in JS regex. Patterns use `(?:\s|$|[,.!?])` or exact string matches instead.

### 5. Settings/Timezone Caching
**File:** `src/lib/agent/handle.ts`

`userTimezone()` now uses a per-request Map cache with 30s TTL. Eliminates redundant `getSettings()` DB calls when multiple handlers in the same request need the timezone (was 10 separate calls per dispatch; now 1).

### 6. HELP_SECTIONS from Registry
**File:** `src/lib/agent/handle.ts`

The 84-line hardcoded `HELP_SECTIONS` array replaced with `buildHelpSections()` from the registry. Help menu is now always in sync with available actions.

## Phase 3 Bug Fixes

| Bug | File | Fix |
|-----|------|-----|
| `expense_delete` defaults to index 1 without confirmation | handle.ts | Now requires explicit index unless exactly 1 expense exists |
| `followup_reopen` defaults to index 1 without confirmation | handle.ts | Now lists closed follow-ups and asks for index unless exactly 1 |
| `goal_manage` uses `getGoalByIndex` (always active) instead of the already-fetched goals array | handle.ts | Uses `goals[intent.index - 1]` from the correct filtered set |

## Gates (2026-07-12T11:05 UTC)

| Gate | Result |
|------|--------|
| lint | ✅ PASS (0 errors, 0 warnings) |
| test | ✅ 206/206 PASS (14 files) |
| build | ✅ PASS (42 routes) |
| security | ✅ 0 high, 1 medium (pre-existing liff/page.tsx) |
| migration parity | ✅ 28/28 |

## Test Coverage

- `tests/phase4-registry.test.ts` (25 tests):
  - Registry parity: every Action has metadata
  - Planner consistency: derived lists match between planner and registry
  - Risk level consistency across planner ↔ registry
  - Fast-path: 14 pattern tests + ambiguity rejection
  - Help sections generation

## Deferred (Incremental)

- **Handler extraction:** The 700-line switch in `handle.ts` dispatch can be split into per-domain handler modules. The registry provides the foundation for this extraction. Left as incremental work to minimize regression risk.
- **Fast-path precision measurement:** Requires production traffic analysis to verify >= 99.5% precision.
- **Cold-start benchmarking:** Dynamic import behavior should be measured before further restructuring.

## Files Created
- `src/lib/agent/registry.ts`
- `src/lib/intent/fast-path.ts`
- `tests/phase4-registry.test.ts`

## Files Modified
- `src/lib/agent/planner.ts` — derives from registry
- `src/lib/intent/router.ts` — delegates validAction to registry, adds fast-path call
- `src/lib/agent/handle.ts` — HELP_SECTIONS from registry, userTimezone caching, 3 bug fixes
