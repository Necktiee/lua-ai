/**
 * Plan execution engine — runs validated plans with dependency-aware scheduling.
 *
 * - Groups steps into execution levels via topological sort
 * - R0 (read-only) steps within the same level run in parallel
 * - R1/R2 (write/destructive) steps are serialized within each level
 * - Failed steps mark dependents as skipped
 * - Returns structured receipts with per-step status
 */
import type { Plan, PlanStep, StepReceipt, PlanResult } from "@/lib/agent/planner";
import { getExecutionLevels, riskLevel, summarizeReceipts } from "@/lib/agent/planner";
import type { HandleInput } from "@/lib/agent/handle";
import type { ChatTurn } from "@/lib/llm/types";

type DispatchFn = (
  intent: { action: string; text: string; raw: string; query?: string; index?: number; priority?: number; tier?: number },
  input: HandleInput,
  history: ChatTurn[],
) => Promise<string | { text: string; messages?: unknown[] }>;

export async function executePlan(
  plan: Plan,
  input: HandleInput,
  history: ChatTurn[],
  dispatch?: DispatchFn,
): Promise<PlanResult> {
  // Get the dispatch function — passed in or dynamically imported
  let dispatchFn: DispatchFn;
  if (dispatch) {
    dispatchFn = dispatch;
  } else {
    // Dynamic import to avoid circular dependency with handle.ts
    const handleMod = await import("@/lib/agent/handle");
    dispatchFn = handleMod.dispatch as DispatchFn;
  }

  const levels = getExecutionLevels(plan);
  const receipts: StepReceipt[] = [];
  const failedSteps = new Set<string>();

  for (const level of levels) {
    // Split into parallel-safe (R0 read-only) and serial (R1/R2 write) steps
    const parallelSteps = level.filter((s) => riskLevel(s.action) === "R0");
    const serialSteps = level.filter((s) => riskLevel(s.action) !== "R0");

    // Process parallel steps concurrently
    const parallelResults = await Promise.all(
      parallelSteps.map(async (step) => {
        return { step, result: await executeStep(step, input, history, dispatchFn, failedSteps) };
      }),
    );

    // Process serial steps sequentially
    const serialResults: { step: PlanStep; result: StepReceipt }[] = [];
    for (const step of serialSteps) {
      const result = await executeStep(step, input, history, dispatchFn, failedSteps);
      serialResults.push({ step, result });
    }

    // Collect receipts in original step order
    for (const step of plan.steps) {
      const found = [...parallelResults, ...serialResults].find((r) => r.step.id === step.id);
      if (found && !receipts.find((r) => r.stepId === step.id)) {
        receipts.push(found.result);
        if (found.result.status === "failed") {
          failedSteps.add(step.id);
        }
      }
    }
  }

  return {
    receipts,
    summary: summarizeReceipts(receipts),
    allSucceeded: receipts.every((r) => r.status === "success"),
  };
}

async function executeStep(
  step: PlanStep,
  input: HandleInput,
  history: ChatTurn[],
  dispatch: DispatchFn,
  failedSteps: Set<string>,
): Promise<StepReceipt> {
  // Check if any dependency failed → skip this step
  const deps = step.depends_on ?? [];
  const failedDepsForStep = deps.filter((d) => failedSteps.has(d));
  if (failedDepsForStep.length > 0) {
    return {
      stepId: step.id,
      action: step.action,
      text: step.text,
      status: "skipped",
      error: `ขั้นที่ต้องมีก่อนหน้าล้มเหลว: ${failedDepsForStep.join(", ")}`,
    };
  }

  try {
    const stepIntent = {
      action: step.action,
      text: step.text,
      query: step.query,
      index: step.index,
      priority: step.priority,
      tier: step.tier,
      raw: step.text,
    };
    const result = await dispatch(stepIntent, input, history);
    if (typeof result === "string") {
      return {
        stepId: step.id,
        action: step.action,
        text: step.text,
        status: "success",
        result,
      };
    }
    return {
      stepId: step.id,
      action: step.action,
      text: step.text,
      status: "success",
      result: result.text,
      messages: result.messages,
    };
  } catch (e) {
    return {
      stepId: step.id,
      action: step.action,
      text: step.text,
      status: "failed",
      error: (e as Error).message,
    };
  }
}
