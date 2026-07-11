/**
 * Typed multi-step planner — bounded steps[] plan with policy/confirmation gate.
 *
 * Phase 7 of the production roadmap. Instead of a single-action router,
 * compound requests can return a plan with multiple validated steps.
 *
 * Limits:
 * - Maximum 5 steps per plan
 * - Allowlisted actions only (no "plan", "chat", "help")
 * - One optional replan after recoverable error
 * - Destructive actions (R2) require confirmation
 */
import type { Action } from "@/lib/intent/router";

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

export const MAX_PLAN_STEPS = 5;

/** Actions that can be included in a plan (no meta-actions). */
const PLANNABLE_ACTIONS: ReadonlySet<string> = new Set([
  "remember", "recall", "remind",
  "todo_add", "todo_list", "todo_done", "todo_cancel", "todo_update", "todo_delete",
  "calendar_add", "calendar_list",
  "followup_add", "followup_list", "followup_close",
  "expense_add", "expense_summary",
  "subscription_add", "subscription_list",
  "goal_add", "goal_log", "goal_progress",
  "people_ask", "people_set_tier",
  "kb_add", "kb_ask", "kb_forget",
  "web_search",
  "briefing", "evening_review", "meeting_prep", "meeting_list",
  "travel_checklist", "journal_show",
  "email_summary", "email_reply",
  "decision_recall",
]);

/** Actions that permanently delete data — require confirmation. */
const DESTRUCTIVE_ACTIONS: ReadonlySet<string> = new Set([
  "todo_delete", "delete_recent", "kb_forget",
]);

/** Actions that create external commitments — require confirmation. */
const EXTERNAL_ACTIONS: ReadonlySet<string> = new Set([
  "calendar_add", "email_reply",
]);

export type RiskLevel = "R0" | "R1" | "R2";

/** Classify an action's risk level for the policy gate. */
export function riskLevel(action: string): RiskLevel {
  if (DESTRUCTIVE_ACTIONS.has(action) || EXTERNAL_ACTIONS.has(action)) return "R2";
  if (PLANNABLE_WRITE_ACTIONS.has(action)) return "R1";
  return "R0";
}

const PLANNABLE_WRITE_ACTIONS: ReadonlySet<string> = new Set([
  "remember", "remind", "todo_add", "todo_done", "todo_cancel", "todo_update",
  "calendar_add", "followup_add", "followup_close",
  "expense_add", "subscription_add",
  "goal_add", "goal_log",
  "people_set_tier", "kb_add", "kb_forget",
  "email_reply",
]);

/**
 * Validate and sanitize a raw plan from the LLM classifier.
 * - Caps at MAX_PLAN_STEPS
 * - Filters out non-planable actions
 * - Assigns sequential IDs
 * - Sets requiresConfirmation if any step is R2
 */
export function validatePlan(rawSteps: unknown[]): Plan | null {
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) return null;

  const steps: PlanStep[] = [];
  let requiresConfirmation = false;

  for (let i = 0; i < Math.min(rawSteps.length, MAX_PLAN_STEPS); i++) {
    const raw = rawSteps[i] as Record<string, unknown>;
    const action = typeof raw.action === "string" ? raw.action : "";
    if (!PLANNABLE_ACTIONS.has(action)) continue;

    const step: PlanStep = {
      id: `s${i + 1}`,
      action: action as PlanStep["action"],
      text: typeof raw.text === "string" ? raw.text : "",
    };
    if (typeof raw.query === "string") step.query = raw.query;
    if (typeof raw.index === "number") step.index = raw.index;
    if ([1, 2, 3].includes(raw.priority as number)) step.priority = raw.priority as 1 | 2 | 3;
    if ([1, 2, 3, 4].includes(raw.tier as number)) step.tier = raw.tier as 1 | 2 | 3 | 4;

    if (riskLevel(action) === "R2") requiresConfirmation = true;
    steps.push(step);
  }

  if (steps.length === 0) return null;
  return { steps, requiresConfirmation };
}
