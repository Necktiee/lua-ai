import { describe, it, expect } from "vitest";
import { validAction, type Action } from "@/lib/intent/router";
import { parsePostbackData } from "@/lib/agent/postback";
import { PLANNABLE_ACTIONS, DESTRUCTIVE_ACTIONS } from "@/lib/agent/planner";

const NEW_ACTIONS: Action[] = [
  "remind_list",
  "remind_cancel",
  "remind_snooze",
  "expense_list",
  "expense_delete",
  "goal_manage",
  "journal_add",
  "followup_reopen",
  "subscription_cancel",
];

describe("Phase 3: Lifecycle Actions", () => {
  it("all new actions pass validAction()", () => {
    for (const a of NEW_ACTIONS) {
      expect(validAction(a)).toBe(true);
    }
  });

  it("total action count is 49 (40 original + 9 new)", () => {
    const knownActions: Action[] = [
      "remember","recall","remind","todo_add","todo_list","todo_done","todo_cancel","todo_update","todo_delete",
      "calendar_add","calendar_list","chat","help","delete_recent",
      "briefing","evening_review","followup_add","followup_list","followup_close","people_ask",
      "expense_add","expense_summary","subscription_add","subscription_list","subscription_cancel",
      "remind_list","remind_cancel","remind_snooze",
      "expense_list","expense_delete","goal_manage","journal_add","followup_reopen",
      "journal_show","goal_add","goal_log","goal_progress","decision_recall",
      "meeting_prep","travel_checklist","email_summary","email_reply","web_search","meeting_list",
      "kb_add","kb_ask","kb_forget","people_set_tier","plan",
    ];
    expect(knownActions.length).toBe(49);
    for (const a of knownActions) expect(validAction(a)).toBe(true);
  });
});

describe("Phase 3: Postback Dispatcher", () => {
  it("parses postback data correctly", () => {
    expect(parsePostbackData("todo_done=abc-123")).toEqual({ action: "todo_done", value: "abc-123" });
    expect(parsePostbackData("followup_close=xyz")).toEqual({ action: "followup_close", value: "xyz" });
    expect(parsePostbackData("remind_cancel=r-1")).toEqual({ action: "remind_cancel", value: "r-1" });
  });

  it("returns null for malformed data", () => {
    expect(parsePostbackData("")).toBeNull();
    expect(parsePostbackData("no_equals_here")).toBeNull();
  });
});

describe("Phase 3: Planner Lifecycle Integration", () => {
  it("new actions are in PLANNABLE_ACTIONS", () => {
    for (const a of NEW_ACTIONS) {
      expect(PLANNABLE_ACTIONS.has(a)).toBe(true);
    }
  });

  it("expense_delete and remind_cancel are DESTRUCTIVE (R2)", () => {
    expect(DESTRUCTIVE_ACTIONS.has("expense_delete")).toBe(true);
    expect(DESTRUCTIVE_ACTIONS.has("remind_cancel")).toBe(true);
  });

  it("safe new actions are NOT destructive", () => {
    expect(DESTRUCTIVE_ACTIONS.has("remind_list")).toBe(false);
    expect(DESTRUCTIVE_ACTIONS.has("expense_list")).toBe(false);
    expect(DESTRUCTIVE_ACTIONS.has("goal_manage")).toBe(false);
    expect(DESTRUCTIVE_ACTIONS.has("journal_add")).toBe(false);
    expect(DESTRUCTIVE_ACTIONS.has("followup_reopen")).toBe(false);
  });
});

describe("Phase 3: Flex Postback Buttons", () => {
  it("buildTodoListFlex generates postback action data", async () => {
    const { buildTodoListFlex } = await import("@/lib/flex/builder");
    const flex = buildTodoListFlex(
      [{ id: "t1", title: "Test todo", priority: 2 }],
      () => "tomorrow",
    ) as Record<string, unknown>;
    const json = JSON.stringify(flex);
    expect(json).toContain("todo_done=t1");
    expect(json).toContain("todo_cancel=t1");
    expect(json).toContain("postback");
  });

  it("buildFollowUpListFlex generates postback close button", async () => {
    const { buildFollowUpListFlex } = await import("@/lib/flex/builder");
    const flex = buildFollowUpListFlex([
      { id: "f1", subject: "Follow up test", ageDays: 3 },
    ]) as Record<string, unknown>;
    const json = JSON.stringify(flex);
    expect(json).toContain("followup_close=f1");
    expect(json).toContain("postback");
  });

  it("empty todo list produces non-crashing flex", async () => {
    const { buildTodoListFlex } = await import("@/lib/flex/builder");
    const flex = buildTodoListFlex([], () => "") as Record<string, unknown>;
    expect(flex).toBeDefined();
    expect(JSON.stringify(flex)).toContain("งานค้าง");
  });
});
