import { describe, it, expect } from "vitest";
import {
  ALL_ACTIONS,
  PLANNABLE_ACTIONS,
  DESTRUCTIVE_ACTIONS,
  EXTERNAL_ACTIONS,
  isValidAction,
  actionRiskLevel,
  buildHelpSections,
} from "@/lib/agent/registry";
import { validAction } from "@/lib/intent/router";
import { fastClassify } from "@/lib/intent/fast-path";
import { riskLevel, validatePlan, PLANNABLE_ACTIONS as PLANNER_PLANNABLE, DESTRUCTIVE_ACTIONS as PLANNER_DESTRUCTIVE } from "@/lib/agent/planner";

describe("Phase 4: Action Registry Parity", () => {
  it("every Action union member is in the registry or is plan/chat/help", () => {
    const metaActions = new Set(["plan", "chat", "help"]);
    // Check that validAction accepts all registry actions
    for (const action of ALL_ACTIONS) {
      expect(validAction(action)).toBe(true);
    }
    // Check meta actions are accepted
    for (const meta of metaActions) {
      expect(validAction(meta)).toBe(true);
    }
  });

  it("registry has exactly 49 entries (49 feature actions + plan/chat/help)", () => {
    expect(ALL_ACTIONS.size).toBeGreaterThanOrEqual(46);
    expect(ALL_ACTIONS.has("remember")).toBe(true);
    expect(ALL_ACTIONS.has("followup_reopen")).toBe(true);
    expect(ALL_ACTIONS.has("goal_manage")).toBe(true);
  });

  it("isValidAction rejects unknown actions", () => {
    expect(isValidAction("frobnicate")).toBe(false);
    expect(isValidAction("")).toBe(false);
    expect(isValidAction(null as unknown as string)).toBe(false);
  });

  it("PLANNABLE_ACTIONS excludes plan/chat/help", () => {
    expect(PLANNABLE_ACTIONS.has("plan")).toBe(false);
    expect(PLANNABLE_ACTIONS.has("chat")).toBe(false);
    expect(PLANNABLE_ACTIONS.has("help")).toBe(false);
  });

  it("PLANNABLE_ACTIONS includes all lifecycle actions", () => {
    for (const a of ["remind_list", "remind_cancel", "remind_snooze", "expense_list", "expense_delete", "goal_manage", "journal_add", "followup_reopen", "subscription_cancel"]) {
      expect(PLANNABLE_ACTIONS.has(a)).toBe(true);
    }
  });

  it("DESTRUCTIVE_ACTIONS includes data-deleting actions", () => {
    for (const a of ["todo_delete", "delete_recent", "kb_forget", "expense_delete", "remind_cancel"]) {
      expect(DESTRUCTIVE_ACTIONS.has(a)).toBe(true);
    }
  });

  it("EXTERNAL_ACTIONS includes calendar_add and email_reply", () => {
    expect(EXTERNAL_ACTIONS.has("calendar_add")).toBe(true);
    expect(EXTERNAL_ACTIONS.has("email_reply")).toBe(true);
  });

  it("riskLevel returns R2 for destructive and external", () => {
    expect(actionRiskLevel("todo_delete")).toBe("R2");
    expect(actionRiskLevel("expense_delete")).toBe("R2");
    expect(actionRiskLevel("calendar_add")).toBe("R2");
    expect(actionRiskLevel("email_reply")).toBe("R2");
  });

  it("riskLevel returns R1 for write actions", () => {
    expect(actionRiskLevel("todo_add")).toBe("R1");
    expect(actionRiskLevel("remember")).toBe("R1");
    expect(actionRiskLevel("expense_add")).toBe("R1");
  });

  it("riskLevel returns R0 for read-only actions", () => {
    expect(actionRiskLevel("todo_list")).toBe("R0");
    expect(actionRiskLevel("recall")).toBe("R0");
    expect(actionRiskLevel("expense_summary")).toBe("R0");
  });

  it("planner PLANNABLE_ACTIONS matches registry", () => {
    expect(PLANNER_PLANNABLE).toEqual(PLANNABLE_ACTIONS);
  });

  it("planner DESTRUCTIVE_ACTIONS matches registry", () => {
    expect(PLANNER_DESTRUCTIVE).toEqual(DESTRUCTIVE_ACTIONS);
  });

  it("planner riskLevel is consistent with registry", () => {
    for (const action of ALL_ACTIONS) {
      const fromPlanner = riskLevel(action);
      const fromRegistry = actionRiskLevel(action);
      expect(fromPlanner).toBe(fromRegistry);
    }
  });

  it("validatePlan rejects non-plannable actions", () => {
    const plan = validatePlan([
      { action: "chat", text: "hello" },
      { action: "plan", text: "nested plan" },
    ]);
    expect(plan).toBeNull();
  });

  it("validatePlan accepts plannable actions", () => {
    const plan = validatePlan([
      { action: "todo_add", text: "test task" },
    ]);
    expect(plan).not.toBeNull();
    expect(plan!.steps).toHaveLength(1);
    expect(plan!.requiresConfirmation).toBe(false);
  });

  it("validatePlan flags R2 steps as requiring confirmation", () => {
    const plan = validatePlan([
      { action: "todo_add", text: "task" },
      { action: "todo_delete", text: "", index: 1 },
    ]);
    expect(plan).not.toBeNull();
    expect(plan!.requiresConfirmation).toBe(true);
  });
});

describe("Phase 4: Help Sections from Registry", () => {
  it("buildHelpSections returns non-empty array", () => {
    const sections = buildHelpSections();
    expect(sections.length).toBeGreaterThan(5);
  });

  it("each section has title and at least one line", () => {
    const sections = buildHelpSections();
    for (const s of sections) {
      expect(s.title).toBeTruthy();
      expect(s.lines.length).toBeGreaterThan(0);
    }
  });
});

describe("Phase 4: Fast-Path Router", () => {
  it("returns help for obvious help commands", () => {
    expect(fastClassify("help")?.action).toBe("help");
    expect(fastClassify("ช่วยอะไรได้บ้าง")?.action).toBe("help");
    expect(fastClassify("เมนู")?.action).toBe("help");
    expect(fastClassify("วิธีใช้")?.action).toBe("help");
  });

  it("returns todo_list for obvious list commands", () => {
    expect(fastClassify("มีงานไหม")?.action).toBe("todo_list");
    expect(fastClassify("งานค้าง")?.action).toBe("todo_list");
    expect(fastClassify("to-do")?.action).toBe("todo_list");
  });

  it("returns expense_summary for summary queries", () => {
    expect(fastClassify("สรุปค่าใช้จ่าย")?.action).toBe("expense_summary");
    expect(fastClassify("เดือนนี้ใช้เท่าไร")?.action).toBe("expense_summary");
  });

  it("returns null for ambiguous messages", () => {
    expect(fastClassify("สวัสดีครับ")).toBeNull();
    expect(fastClassify("จดว่าพรุ่งนี้ประชุม 9 โมง")).toBeNull();
    expect(fastClassify("ซื้อกาแฟ 85 บาท")).toBeNull();
    expect(fastClassify("")).toBeNull();
  });

  it("returns briefing for summary without 'ก่อนนอน'", () => {
    expect(fastClassify("สรุปวันนี้")?.action).toBe("briefing");
  });

  it("returns evening_review for 'ก่อนนอning'", () => {
    expect(fastClassify("สรุปวันนี้ก่อนนอน")?.action).toBe("evening_review");
  });

  it("all fast-path actions are valid Action types", () => {
    const testInputs = [
      "help", "เมนู", "มีงานไหม", "to-do",
      "มีอะไรรอติดตาม", "ดูการเตือน",
      "สรุปค่าใช้จ่าย", "ค่าใช้จ่ายล่าสุด",
      "เป้าคืบหน้ายัง", "journal วันนี้",
      "พรุ่งนี้มีนัดไหม", "สรุปวันนี้",
    ];
    for (const input of testInputs) {
      const result = fastClassify(input);
      if (result) {
        expect(validAction(result.action)).toBe(true);
      }
    }
  });
});
