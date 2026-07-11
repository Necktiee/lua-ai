import { describe, it, expect } from "vitest";
import { validatePlan, riskLevel, MAX_PLAN_STEPS } from "../src/lib/agent/planner";

describe("Phase 7: Typed multi-step planner", () => {
  it("validatePlan should accept valid steps", () => {
    const plan = validatePlan([
      { action: "todo_add", text: "ส่งรายงาน" },
      { action: "remind", text: "เตือนส่งรายงานพรุ่งนี้ 9 โมง" },
    ]);
    expect(plan).not.toBeNull();
    expect(plan!.steps).toHaveLength(2);
    expect(plan!.requiresConfirmation).toBe(false);
  });

  it("validatePlan should cap at MAX_PLAN_STEPS", () => {
    const steps = Array.from({ length: 10 }, (_, i) => ({ action: "remember", text: `item-${i}` }));
    const plan = validatePlan(steps);
    expect(plan!.steps.length).toBeLessThanOrEqual(MAX_PLAN_STEPS);
  });

  it("validatePlan should filter out non-planable actions", () => {
    const plan = validatePlan([
      { action: "todo_add", text: "valid" },
      { action: "chat", text: "should be filtered" },
      { action: "help", text: "should be filtered" },
    ]);
    expect(plan!.steps).toHaveLength(1);
    expect(plan!.steps[0].action).toBe("todo_add");
  });

  it("validatePlan should return null for empty steps", () => {
    expect(validatePlan([])).toBeNull();
    expect(validatePlan([{ action: "invalid" }])).toBeNull();
  });

  it("validatePlan should assign sequential IDs", () => {
    const plan = validatePlan([
      { action: "todo_add", text: "a" },
      { action: "todo_add", text: "b" },
    ]);
    expect(plan!.steps[0].id).toBe("s1");
    expect(plan!.steps[1].id).toBe("s2");
  });
});

describe("Phase 7: Policy gate", () => {
  it("riskLevel should return R2 for destructive actions", () => {
    expect(riskLevel("todo_delete")).toBe("R2");
    expect(riskLevel("kb_forget")).toBe("R2");
    expect(riskLevel("delete_recent")).toBe("R2");
  });

  it("riskLevel should return R2 for external actions", () => {
    expect(riskLevel("calendar_add")).toBe("R2");
    expect(riskLevel("email_reply")).toBe("R2");
  });

  it("riskLevel should return R1 for reversible writes", () => {
    expect(riskLevel("todo_add")).toBe("R1");
    expect(riskLevel("remind")).toBe("R1");
    expect(riskLevel("remember")).toBe("R1");
  });

  it("riskLevel should return R0 for read-only actions", () => {
    expect(riskLevel("todo_list")).toBe("R0");
    expect(riskLevel("recall")).toBe("R0");
    expect(riskLevel("kb_ask")).toBe("R0");
  });

  it("plan with destructive step should require confirmation", () => {
    const plan = validatePlan([
      { action: "todo_add", text: "new task" },
      { action: "todo_delete", text: "delete old task", index: 1 },
    ]);
    expect(plan!.requiresConfirmation).toBe(true);
  });

  it("plan with only R0/R1 actions should not require confirmation", () => {
    const plan = validatePlan([
      { action: "todo_add", text: "task 1" },
      { action: "remind", text: "remind tomorrow" },
    ]);
    expect(plan!.requiresConfirmation).toBe(false);
  });
});
