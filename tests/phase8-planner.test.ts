import { describe, it, expect } from "vitest";
import {
  validatePlan,
  getExecutionLevels,
  summarizeReceipts,
  MAX_PLAN_STEPS,
  type Plan,
  type StepReceipt,
} from "@/lib/agent/planner";
import { executePlan } from "@/lib/agent/plan-exec";
import type { HandleInput } from "@/lib/agent/handle";

const mockInput: HandleInput = {
  userId: "Utest",
  text: "",
};

type MockDispatch = (
  intent: Record<string, unknown>,
) => Promise<string | { text: string; messages?: unknown[] }>;

describe("Phase 8: Bounded Multi-Step Intelligence", () => {
  describe("Dependency graph validation", () => {
    it("rejects plan with cycle in depends_on", () => {
      const raw = [
        { action: "todo_add", text: "task A", depends_on: ["s2"] },
        { action: "todo_add", text: "task B", depends_on: ["s1"] },
      ];
      expect(validatePlan(raw)).toBeNull();
    });

    it("accepts plan with valid linear dependencies", () => {
      const raw = [
        { action: "todo_add", text: "task A" },
        { action: "todo_add", text: "task B", depends_on: ["s1"] },
      ];
      const plan = validatePlan(raw);
      expect(plan).not.toBeNull();
      expect(plan!.steps).toHaveLength(2);
    });

    it("filters out depends_on references to non-existent step IDs", () => {
      const raw = [
        { action: "todo_add", text: "task A", depends_on: ["s99"] },
        { action: "todo_add", text: "task B" },
      ];
      const plan = validatePlan(raw);
      expect(plan).not.toBeNull();
      expect(plan!.steps[0].depends_on).toBeUndefined();
    });

    it("removes empty depends_on after filtering", () => {
      const raw = [
        { action: "todo_add", text: "task A", depends_on: ["s99"] },
      ];
      const plan = validatePlan(raw);
      expect(plan).not.toBeNull();
      expect(plan!.steps[0].depends_on).toBeUndefined();
    });

    it("rejects self-referencing dependency (cycle)", () => {
      const raw = [
        { action: "todo_add", text: "task A", depends_on: ["s1"] },
      ];
      expect(validatePlan(raw)).toBeNull();
    });
  });

  describe("Topological execution levels", () => {
    it("groups independent steps in the same level", () => {
      const plan: Plan = {
        steps: [
          { id: "s1", action: "todo_add", text: "A" },
          { id: "s2", action: "todo_add", text: "B" },
          { id: "s3", action: "todo_add", text: "C" },
        ],
        requiresConfirmation: false,
      };
      const levels = getExecutionLevels(plan);
      expect(levels).toHaveLength(1);
      expect(levels[0]).toHaveLength(3);
    });

    it("separates dependent steps into different levels", () => {
      const plan: Plan = {
        steps: [
          { id: "s1", action: "todo_add", text: "A" },
          { id: "s2", action: "todo_add", text: "B", depends_on: ["s1"] },
          { id: "s3", action: "todo_add", text: "C", depends_on: ["s2"] },
        ],
        requiresConfirmation: false,
      };
      const levels = getExecutionLevels(plan);
      expect(levels).toHaveLength(3);
      expect(levels[0][0].id).toBe("s1");
      expect(levels[1][0].id).toBe("s2");
      expect(levels[2][0].id).toBe("s3");
    });

    it("handles diamond dependency (A→B, A→C, B→D, C→D)", () => {
      const plan: Plan = {
        steps: [
          { id: "s1", action: "todo_add", text: "A" },
          { id: "s2", action: "todo_add", text: "B", depends_on: ["s1"] },
          { id: "s3", action: "todo_add", text: "C", depends_on: ["s1"] },
          { id: "s4", action: "todo_add", text: "D", depends_on: ["s2", "s3"] },
        ],
        requiresConfirmation: false,
      };
      const levels = getExecutionLevels(plan);
      expect(levels).toHaveLength(3);
      expect(levels[0]).toHaveLength(1); // A
      expect(levels[1]).toHaveLength(2); // B, C
      expect(levels[2]).toHaveLength(1); // D
    });
  });

  describe("Structured step receipts", () => {
    it("summarizeReceipts reports all-success", () => {
      const receipts: StepReceipt[] = [
        { stepId: "s1", action: "todo_add", text: "A", status: "success", result: "ok" },
        { stepId: "s2", action: "todo_add", text: "B", status: "success", result: "ok" },
      ];
      expect(summarizeReceipts(receipts)).toContain("ครบ 2 ขั้นตอน");
    });

    it("summarizeReceipts reports mixed results", () => {
      const receipts: StepReceipt[] = [
        { stepId: "s1", action: "todo_add", text: "A", status: "success", result: "ok" },
        { stepId: "s2", action: "todo_add", text: "B", status: "failed", error: "err" },
        { stepId: "s3", action: "todo_add", text: "C", status: "skipped" },
      ];
      const summary = summarizeReceipts(receipts);
      expect(summary).toContain("สำเร็จ 1");
      expect(summary).toContain("ล้มเหลว 1");
      expect(summary).toContain("ข้าม 1");
    });

    it("executePlan skips steps whose dependencies failed", async () => {
      const plan: Plan = {
        steps: [
          { id: "s1", action: "todo_add", text: "A" },
          { id: "s2", action: "todo_add", text: "B", depends_on: ["s1"] },
        ],
        requiresConfirmation: false,
      };
      const mockDispatch: MockDispatch = async (intent: Record<string, unknown>) => {
        if (intent.text === "A") throw new Error("boom");
        return "ok";
      };
      const result = await executePlan(plan, mockInput, [], mockDispatch);
      expect(result.receipts[0].status).toBe("failed");
      expect(result.receipts[1].status).toBe("skipped");
      expect(result.allSucceeded).toBe(false);
    });

    it("executePlan runs independent R0 steps and returns success", async () => {
      const plan: Plan = {
        steps: [
          { id: "s1", action: "todo_list", text: "A" },
          { id: "s2", action: "todo_list", text: "B" },
        ],
        requiresConfirmation: false,
      };
      const mockDispatch: MockDispatch = async () => "done";
      const result = await executePlan(plan, mockInput, [], mockDispatch);
      expect(result.allSucceeded).toBe(true);
      expect(result.receipts).toHaveLength(2);
      expect(result.receipts.every((r) => r.status === "success")).toBe(true);
    });
  });

  describe("Plan limits and safety", () => {
    it("caps at MAX_PLAN_STEPS (5)", () => {
      const raw = Array.from({ length: 10 }, (_, i) => ({
        action: "todo_add",
        text: `task ${i}`,
      }));
      const plan = validatePlan(raw);
      expect(plan!.steps).toHaveLength(MAX_PLAN_STEPS);
    });

    it("rejects non-plannable actions", () => {
      const raw = [
        { action: "chat", text: "hello" },
        { action: "help", text: "help" },
        { action: "plan", text: "nested plan" },
      ];
      expect(validatePlan(raw)).toBeNull();
    });

    it("R2 action sets requiresConfirmation", () => {
      const raw = [
        { action: "expense_delete", text: "delete expense" },
      ];
      const plan = validatePlan(raw);
      expect(plan!.requiresConfirmation).toBe(true);
    });

    it("R0-only plan does not require confirmation", () => {
      const raw = [
        { action: "todo_list", text: "list todos" },
        { action: "calendar_list", text: "list calendar" },
      ];
      const plan = validatePlan(raw);
      expect(plan!.requiresConfirmation).toBe(false);
    });
  });

  describe("Plan correction path", () => {
    it("handle.ts has cancel plan intercept with cancelPendingActions", async () => {
      const fs = await import("node:fs");
      const src = fs.readFileSync("src/lib/agent/handle.ts", "utf-8");
      expect(src).toContain("ยกเลิกแผน");
      expect(src).toContain("cancelPendingActions");
    });

    it("confirmation message includes cancel instruction", async () => {
      const fs = await import("node:fs");
      const src = fs.readFileSync("src/lib/agent/handle.ts", "utf-8");
      expect(src).toContain("ยกเลิกแผน");
    });

    it("cancelPendingActions exists in pending.ts and does NOT filter on expiry", async () => {
      const fs = await import("node:fs");
      const src = fs.readFileSync("src/lib/agent/pending.ts", "utf-8");
      expect(src).toContain("cancelPendingActions");
      // The cancel function should set status to "cancelled" without lt("expires_at")
      const fnStart = src.indexOf("async function cancelPendingActions");
      const fnBody = src.slice(fnStart, fnStart + 500);
      expect(fnBody).toContain("cancelled");
      expect(fnBody).not.toContain(".lt(");
    });
  });

  describe("Phase 8 audit fixes", () => {
    it("confirmation resume re-validates stored plan", async () => {
      const fs = await import("node:fs");
      const src = fs.readFileSync("src/lib/agent/handle.ts", "utf-8");
      expect(src).toContain("validatePlan(rawPlan.steps)");
    });

    it("confirmation resume fetches recent history (not empty [])", async () => {
      const fs = await import("node:fs");
      const src = fs.readFileSync("src/lib/agent/handle.ts", "utf-8");
      expect(src).toContain("confirmHistory");
      expect(src).toContain("recentHistory(userId, 12)");
    });

    it("StepReceipt has messages field for Flex preservation", () => {
      const receipt: StepReceipt = {
        stepId: "s1",
        action: "todo_list",
        text: "list",
        status: "success",
        messages: [{ type: "flex" }],
      };
      expect(receipt.messages).toBeDefined();
      expect(receipt.messages).toHaveLength(1);
    });

    it("validatePlan iterates all raw entries, not just first MAX_PLAN_STEPS", () => {
      // 5 non-plannable + 2 valid = should produce 2 steps, not 0
      const raw = [
        { action: "chat", text: "1" },
        { action: "chat", text: "2" },
        { action: "chat", text: "3" },
        { action: "chat", text: "4" },
        { action: "chat", text: "5" },
        { action: "todo_add", text: "valid A" },
        { action: "todo_add", text: "valid B" },
      ];
      const plan = validatePlan(raw);
      expect(plan).not.toBeNull();
      expect(plan!.steps).toHaveLength(2);
      expect(plan!.steps[0].id).toBe("s1");
      expect(plan!.steps[1].id).toBe("s2");
    });

    it("step IDs are sequential after filtering (no gaps)", () => {
      const raw = [
        { action: "chat", text: "skip me" },
        { action: "todo_add", text: "A" },
        { action: "help", text: "skip me too" },
        { action: "todo_add", text: "B" },
      ];
      const plan = validatePlan(raw);
      expect(plan).not.toBeNull();
      expect(plan!.steps[0].id).toBe("s1");
      expect(plan!.steps[1].id).toBe("s2");
    });

    it("summarizeReceipts handles empty array", () => {
      expect(summarizeReceipts([])).not.toContain("ทำครบ 0");
    });
  });
});
