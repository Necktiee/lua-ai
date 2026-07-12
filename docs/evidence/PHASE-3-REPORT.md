# Phase 3: Complete Core Secretary Lifecycles — Evidence Report

**Date:** 2026-07-12  
**Scope:** Close write-only gaps across reminders, expenses, subscriptions, goals, journals, and follow-ups. Add LINE Flex postback infrastructure for one-tap actions.

## Deliverables

### 1. New Actions (9)

| Action | Purpose | Source |
|--------|---------|--------|
| `remind_list` | List upcoming reminders | handle.ts dispatch |
| `remind_cancel` | Cancel by index | handle.ts dispatch |
| `remind_snooze` | Snooze by index + duration | handle.ts dispatch |
| `expense_list` | List recent expenses | handle.ts dispatch |
| `expense_delete` | Delete by index | handle.ts dispatch |
| `subscription_cancel` | Cancel subscription by name/index | handle.ts dispatch |
| `goal_manage` | Pause/resume/archive/complete | handle.ts dispatch |
| `journal_add` | Manual journal entry (fixes dead promise) | handle.ts dispatch |
| `followup_reopen` | Reopen closed follow-up | handle.ts dispatch |

### 2. Repository Functions

**`src/lib/remind/schedule.ts`:**
- `cancelReminderByIndex(userId, index)` — 1-based index resolution
- `snoozeReminder(id, newFireAt)` — cancel old QStash + update fire_at + re-schedule
- `snoozeReminderByIndex(userId, index, newFireAt)` — index wrapper
- `listUpcoming` limit increased from 5 → 10

**`src/lib/expense/repo.ts`:**
- `deleteExpenseByIndex(userId, index)` — 1-based from listExpenses order
- `updateExpense(userId, id, patch)` — edit amount/category/description/date

**`src/lib/goal/repo.ts`:**
- `setGoalStatus(userId, id, status)` — pause/resume/archive/complete
- `getGoalByIndex(userId, index)` — 1-based from active goals

**`src/lib/journal/repo.ts`:**
- `addJournalEntry(userId, content, date?, timeZone?)` — manual entry (auto_generated=false)
- `searchJournalEntries(userId, query)` — ILIKE text search

**`src/lib/followup/repo.ts`:**
- `reopenFollowUp(userId, id)` — flip closed→open, reset nudge count
- `reopenFollowUpByIndex(userId, index)` — 1-based from closed list

### 3. LINE Flex Postback Infrastructure

**`src/lib/agent/postback.ts` (NEW):**
- `parsePostbackData(data)` — URL-safe `action=value` parser
- `handlePostback(userId, data, webhookEventId?)` — dispatcher with mutation idempotency
- Supported: `todo_done`, `todo_cancel`, `followup_close`, `remind_cancel`
- Each action flows through `claimMutation()` for LINE redelivery safety

**`src/app/api/line/route.ts` (MODIFIED):**
- `LineEvent` interface extended with `postback?: { data: string; params?: ... }`
- Intake loop accepts `ev.type === "postback"` alongside `"message"`
- `processEvent()` dispatches postbacks via `handlePostback()` before LLM classify

**`src/lib/flex/builder.ts` (MODIFIED):**
- `buildTodoListFlex` now accepts `{id, title, due_at, priority}[]` and emits per-todo bubble with "✅ ทำเสร็จ" and "🚫 ยกเลิก" postback buttons (carousel for >1)
- `buildFollowUpListFlex` (NEW) — per-followup bubble with "✅ ปิด" postback button

### 4. Planner Integration

- All 9 new actions added to `PLANNABLE_ACTIONS` (multi-step plan support)
- `expense_delete` and `remind_cancel` added to `DESTRUCTIVE_ACTIONS` (R2 confirmation)
- `PLANNABLE_ACTIONS` and `DESTRUCTIVE_ACTIONS` now exported for test access

### 5. Help Menu Updated

`HELP_SECTIONS` in handle.ts documents all new capabilities including postback buttons.

## Files Created
- `src/lib/agent/postback.ts`
- `tests/phase3-lifecycle.test.ts`

## Files Modified
- `src/lib/intent/router.ts` — 9 new actions in type union, validAction, classifier prompt
- `src/lib/agent/handle.ts` — 9 new dispatch cases, updated help, updated followup_list to use Flex
- `src/lib/agent/planner.ts` — extended PLANNABLE_ACTIONS + DESTRUCTIVE_ACTIONS, exported both
- `src/lib/remind/schedule.ts` — snooze + cancel-by-index functions
- `src/lib/expense/repo.ts` — delete-by-index + update functions
- `src/lib/goal/repo.ts` — setGoalStatus + getGoalByIndex functions
- `src/lib/journal/repo.ts` — addJournalEntry + searchJournalEntries functions
- `src/lib/followup/repo.ts` — reopenFollowUp + reopenFollowUpByIndex functions
- `src/lib/flex/builder.ts` — buildTodoListFlex with postback buttons, new buildFollowUpListFlex
- `src/app/api/line/route.ts` — postback event intake + dispatch
- `AGENTS.md` — test count, action count updated

## Verification Gates

| Gate | Result |
|------|--------|
| lint | PASS (0 errors, 0 warnings) |
| test | 181/181 PASS (13 files, +10 new tests) |
| build | PASS (42 routes) |
| security | 0 high, 1 medium (pre-existing liff/page.tsx) |
| migration parity | 28 local / 26 cloud (unchanged — no new migrations) |

## Entity-Operation Matrix (Post-Phase 3)

| Entity | Create | List | Edit | Cancel/Delete | Notes |
|--------|--------|------|------|---------------|-------|
| Reminders | ✅ chat | ✅ chat `remind_list` | ✅ chat `remind_snooze` | ✅ chat `remind_cancel` | Snooze re-schedules QStash |
| Calendar | ✅ chat | ✅ chat | ❌ (external API needed) | ❌ (external API needed) | Google patch/delete not yet wired |
| Expenses | ✅ chat | ✅ chat `expense_list` | ✅ repo `updateExpense` | ✅ chat `expense_delete` | Edit via dashboard only (PATCH route exists) |
| Subscriptions | ✅ chat | ✅ chat | ❌ (needs repo fn) | ✅ chat `subscription_cancel` | Edit still missing |
| Goals | ✅ chat | ✅ chat | ✅ chat `goal_manage` | ✅ chat `goal_manage` | Pause/resume/archive/complete all functional |
| Journal | ✅ chat `journal_add` | ✅ chat `journal_show` | ❌ (needs repo fn) | ❌ | Manual create fixes dead promise |
| Follow-ups | ✅ chat | ✅ chat (with Flex buttons) | ❌ (needs repo fn) | ✅ chat (with Flex buttons) | Reopen now possible |
| Travel | ❌ (no persistence) | ✅ ephemeral | n/a | n/a | Unchanged from prior phase |

## Remaining Gaps (Deferred)
- Calendar update/delete (requires Google Calendar API patch/delete calls)
- Subscription edit (needs `updateSubscription` repo function)
- Journal edit (needs `updateJournalEntry` repo function + `journal_edit` action)
- Travel persistence (needs new table + entity model)
- Recurring reminders (needs rrule schema)
