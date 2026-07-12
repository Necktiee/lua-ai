# Phase 8: Bounded Multi-Step Intelligence

**Date:** 2026-07-12
**Status:** COMPLETE
**Gates:** lint PASS · test 277/277 (18 files) · build 42 routes · security 0H/1M · migrations 30 local / 28 cloud

## Deliverables

### 8a: Dependency Graph Validation (`planner.ts`)
- **Cycle detection**: DFS-based 3-color (WHITE/GRAY/BLACK) algorithm rejects plans with cyclic dependencies
- **Reference validation**: `depends_on` filtered to valid step IDs; dangling refs removed
- **Self-reference rejection**: a step depending on itself is a cycle → plan rejected
- `hasCycle()` internal, called by `validatePlan()`

### 8b: Topological Execution Levels (`getExecutionLevels`)
- Groups steps by dependency level (Kahn's algorithm variant)
- Independent steps (no deps on each other) grouped in same level
- Diamond dependency (A→B, A→C, B→D, C→D) correctly produces 3 levels
- Fallback: if cycle somehow slips through, remaining steps pushed as single level

### 8c: Parallel Execution Engine (`plan-exec.ts`)
- **New module**: `src/lib/agent/plan-exec.ts`
- R0 (read-only) steps within the same level run in parallel via `Promise.all`
- R1/R2 (write/destructive) steps serialized within each level for idempotency safety
- Failed step marks all transitively dependent steps as `skipped`
- Returns structured `PlanResult { receipts, summary, allSucceeded }`

### 8d: Structured Step Receipts
- `StepReceipt`: `{ stepId, action, text, status, result?, error? }`
- `StepStatus`: `"success" | "failed" | "skipped"`
- `summarizeReceipts()`: Thai summary ("ทำครบ 3 ขั้นตอน" or "ผล: สำเร็จ 2, ล้มเหลว 1, ข้าม 1 จาก 4 ขั้น")
- Plan handler returns formatted receipt list with ✅/❌/⏭️ indicators

### 8e: Plan Correction Path
- `"ยกเลิกแผน"` / `"cancel plan"` → expires all pending actions for user
- Confirmation message now includes cancel instruction
- Intercepted BEFORE LLM classification (same as `"ยืนยัน"`)

### 8f: Phase 7 Audit Fixes (also in this session)

| Bug | Severity | Fix |
|---|---|---|
| Domain SOP dead code (chatReply didn't pass action) | CRITICAL | Threaded `intent.action` → `chatReply(action)` → `buildAgentContext(action)` |
| Memory SOP contradicts summarization behavior | MEDIUM | Rewrote to "เนื้อหาที่จดจะถูกสรุปกระชับสำหรับเนื้อหายาว แต่เก็บ key facts" |
| Finance SOP aspirational subscription briefing claim | MEDIUM | Removed unimplemented subscription renewal bullet |
| Thai typo `ปฏิทิยน` → `ปฏิทิน` in registry | MEDIUM | Fixed |
| T1 wording `อย่างไร` → `อะไร` | LOW | Reverted to natural Thai |
| Dynamic import in buildAgentContext | LOW | Converted to static import |
| Eval replay missing version fields | MEDIUM | Added `domain_sop_version`, `web_search_version` |

## Test Coverage

| Test File | Tests | Coverage |
|---|---|---|
| `phase7-prompt-registry.test.ts` | 31 | + 8 audit fix tests (wiring, typo, SOP accuracy, eval replay) |
| `phase8-planner.test.ts` | 18 | Dependency validation, cycle detection, topological levels, parallel execution, receipts, plan limits, correction path |

## Architecture

```
Plan flow:
  classify() → intent.steps → validatePlan() → Plan {steps, requiresConfirmation}
    ↓ if R2
  createPendingAction() → user types "ยืนยัน"
    ↓
  consumePendingAction() → executePlan()
    ↓
  getExecutionLevels() → [[s1,s2], [s3], [s4]]
    ↓ per level
  R0 steps: Promise.all(executeStep)
  R1/R2 steps: sequential executeStep
    ↓
  StepReceipt[] → summarizeReceipts() → formatted output
```

## Acceptance Criteria

- [x] Plan schema has IDs, typed actions, dependencies, risk levels
- [x] Maximum 5 steps, no recursive planning
- [x] Dependency graph validated: cycles rejected, references checked
- [x] Independent R0 steps execute in parallel
- [x] Dependent mutations serialized
- [x] Destructive steps require confirmation before any write
- [x] Duplicate confirmation → exactly one effect (consumePendingAction atomic)
- [x] Failed step → dependents skipped, not executed
- [x] Structured receipts with per-step status
- [x] Plan correction: "ยกเลิกแผน" to cancel

## Deferred

- Saga/compensation rollback (requires per-action undo logic)
- Edit stored plan steps ("แก้ขั้นที่ 2 เป็น X")
- Expected result validation per step
- Failure injection test suite (needs live LLM)
