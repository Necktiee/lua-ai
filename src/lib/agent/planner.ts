/**
 * Typed multi-step planner — bounded steps[] plan with policy/confirmation gate.
 *
 * Phase 8 improvements:
 * - Dependency graph validation (cycle detection, topological sort)
 * - Parallel execution of independent read-only steps
 * - Structured step receipts with status per step
 * - Plan correction path (skip/edit/cancel pending plans)
 *
 * Limits:
 * - Maximum 5 steps per plan
 * - Allowlisted actions only (no "plan", "chat", "help")
 * - One optional replan after recoverable error
 * - Destructive actions (R2) require confirmation
 * - No recursive planning (a plan step cannot itself be "plan")
 */
import type { Action } from "@/lib/intent/router";
import {
  PLANNABLE_ACTIONS,
  DESTRUCTIVE_ACTIONS,
  EXTERNAL_ACTIONS,
  PLANNABLE_WRITE_ACTIONS,
  type RiskLevel,
} from "@/lib/agent/registry";

export { type RiskLevel };

export interface PlanStep {
  id: string;
  action: Exclude<Action, "plan" | "chat" | "help">;
  text: string;
  query?: string;
  index?: number;
  priority?: 1 | 2 | 3;
  tier?: 1 | 2 | 3 | 4;
  depends_on?: string[];
}

export interface Plan {
  steps: PlanStep[];
  requiresConfirmation: boolean;
}

export type StepStatus = "success" | "failed" | "skipped";

export interface StepReceipt {
  stepId: string;
  action: string;
  text: string;
  status: StepStatus;
  result?: string;
  error?: string;
  messages?: unknown[];
}

export interface PlanResult {
  receipts: StepReceipt[];
  summary: string;
  allSucceeded: boolean;
}

export const MAX_PLAN_STEPS = 5;

export { PLANNABLE_ACTIONS, DESTRUCTIVE_ACTIONS };

/** Classify an action's risk level for the policy gate. */
export function riskLevel(action: string): RiskLevel {
  if (DESTRUCTIVE_ACTIONS.has(action) || EXTERNAL_ACTIONS.has(action)) return "R2";
  if (PLANNABLE_WRITE_ACTIONS.has(action)) return "R1";
  return "R0";
}

/**
 * Detect cycles in dependency graph using DFS.
 * Returns true if a cycle is found.
 */
function hasCycle(steps: PlanStep[]): boolean {
  const ids = new Set(steps.map((s) => s.id));
  const adj = new Map<string, string[]>();
  for (const s of steps) {
    adj.set(s.id, (s.depends_on ?? []).filter((d) => ids.has(d)));
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const s of steps) color.set(s.id, WHITE);

  function dfs(id: string): boolean {
    color.set(id, GRAY);
    for (const dep of adj.get(id) ?? []) {
      const c = color.get(dep);
      if (c === GRAY) return true;
      if (c === WHITE && dfs(dep)) return true;
    }
    color.set(id, BLACK);
    return false;
  }

  for (const s of steps) {
    if (color.get(s.id) === WHITE && dfs(s.id)) return true;
  }
  return false;
}

/**
 * Topological sort of steps based on depends_on.
 * Steps with no dependencies are grouped together (can run in parallel).
 * Returns levels: each level is an array of steps that can execute concurrently.
 */
function topologicalLevels(steps: PlanStep[]): PlanStep[][] {
  const ids = new Set(steps.map((s) => s.id));
  const completed = new Set<string>();
  const levels: PlanStep[][] = [];

  let remaining = [...steps];
  while (remaining.length > 0) {
    const level = remaining.filter((s) =>
      (s.depends_on ?? []).every((d) => !ids.has(d) || completed.has(d)),
    );
    if (level.length === 0) {
      // Cycle — fall back to original order for remaining steps
      levels.push(remaining);
      break;
    }
    levels.push(level);
    for (const s of level) completed.add(s.id);
    remaining = remaining.filter((s) => !completed.has(s.id));
  }
  return levels;
}

/**
 * Validate and sanitize a raw plan from the LLM classifier.
 * - Caps at MAX_PLAN_STEPS
 * - Filters out non-planable actions
 * - Assigns sequential IDs
 * - Validates depends_on references
 * - Rejects dependency cycles
 * - Sets requiresConfirmation if any step is R2
 */
export function validatePlan(rawSteps: unknown[]): Plan | null {
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) return null;

  // First pass: filter to plannable actions (iterate ALL raw entries,
  // not just first MAX_PLAN_STEPS — otherwise non-plannable entries at
  // the start consume the cap and valid steps at the tail are missed).
  const acceptedRaw: { raw: Record<string, unknown>; rawIndex: number }[] = [];

  for (let i = 0; i < rawSteps.length; i++) {
    if (acceptedRaw.length >= MAX_PLAN_STEPS) break;
    const raw = rawSteps[i] as Record<string, unknown>;
    const action = typeof raw.action === "string" ? raw.action : "";
    if (!PLANNABLE_ACTIONS.has(action)) continue;
    acceptedRaw.push({ raw, rawIndex: i });
  }

  if (acceptedRaw.length === 0) return null;

  // Second pass: assign sequential IDs (s1, s2, ...) and build steps
  const steps: PlanStep[] = [];
  let requiresConfirmation = false;
  const oldIdToNew = new Map<string, string>(); // raw s{i+1} → sequential s{j+1}

  for (let j = 0; j < acceptedRaw.length; j++) {
    const { raw } = acceptedRaw[j];
    const action = raw.action as string;
    const oldId = `s${j + 1}`; // placeholder, updated below
    const newId = `s${steps.length + 1}`;

    const step: PlanStep = {
      id: newId,
      action: action as PlanStep["action"],
      text: typeof raw.text === "string" ? raw.text : "",
    };
    if (typeof raw.query === "string") step.query = raw.query;
    if (typeof raw.index === "number") step.index = raw.index;
    if ([1, 2, 3].includes(raw.priority as number)) step.priority = raw.priority as 1 | 2 | 3;
    if ([1, 2, 3, 4].includes(raw.tier as number)) step.tier = raw.tier as 1 | 2 | 3 | 4;
    if (Array.isArray(raw.depends_on)) {
      step.depends_on = raw.depends_on.filter(
        (d) => typeof d === "string",
      ) as string[];
    }

    if (riskLevel(action) === "R2") requiresConfirmation = true;
    steps.push(step);
    oldIdToNew.set(oldId, newId);
  }

  // Validate depends_on references and remap to sequential IDs
  const validIds = new Set(steps.map((s) => s.id));
  for (const step of steps) {
    if (step.depends_on) {
      step.depends_on = step.depends_on.filter((d) => validIds.has(d));
      // Dedupe
      step.depends_on = [...new Set(step.depends_on)];
      if (step.depends_on.length === 0) delete step.depends_on;
    }
  }

  // Reject cycles
  if (hasCycle(steps)) return null;

  return { steps, requiresConfirmation };
}

/**
 * Get execution levels for parallel-safe execution.
 * Independent steps (no dependency on each other) can run in the same level.
 * Within each level, read-only steps (R0) can run in parallel; write steps
 * (R1/R2) are serialized to maintain idempotency.
 */
export function getExecutionLevels(plan: Plan): PlanStep[][] {
  return topologicalLevels(plan.steps);
}

/**
 * Build a human-readable summary from step receipts.
 */
export function summarizeReceipts(receipts: StepReceipt[]): string {
  if (receipts.length === 0) return "ไม่มีขั้นตอนที่ทำ";

  const succeeded = receipts.filter((r) => r.status === "success");
  const failed = receipts.filter((r) => r.status === "failed");
  const skipped = receipts.filter((r) => r.status === "skipped");

  if (failed.length === 0 && skipped.length === 0) {
    return `ทำครบ ${succeeded.length} ขั้นตอน`;
  }

  const parts: string[] = [];
  if (succeeded.length > 0) parts.push(`สำเร็จ ${succeeded.length}`);
  if (failed.length > 0) parts.push(`ล้มเหลว ${failed.length}`);
  if (skipped.length > 0) parts.push(`ข้าม ${skipped.length}`);
  return `ผล: ${parts.join(", ")} จาก ${receipts.length} ขั้น`;
}
