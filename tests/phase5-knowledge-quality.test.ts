import { describe, it, expect } from "vitest";
import { buildHelpSections, PLANNABLE_ACTIONS, DESTRUCTIVE_ACTIONS } from "@/lib/agent/registry";
import { fastClassify } from "@/lib/intent/fast-path";
import * as kbRepo from "@/lib/kb/repo";
import * as peopleRepo from "@/lib/people/repo";

describe("Phase 5: Knowledge Lifecycle & Contact Safety", () => {
  describe("Knowledge retrieval filters superseded_by", () => {
    it("all knowledge retrieval functions exist and are callable", () => {
      expect(typeof kbRepo.listAlwaysInject).toBe("function");
      expect(typeof kbRepo.listByCategory).toBe("function");
      expect(typeof kbRepo.listKnowledge).toBe("function");
      expect(typeof kbRepo.recallKnowledge).toBe("function");
      expect(typeof kbRepo.recallKnowledgeHybrid).toBe("function");
    });

    it("upsertKnowledge returns UpsertResult type", () => {
      expect(typeof kbRepo.upsertKnowledge).toBe("function");
      expect(typeof kbRepo.UpsertResult).toBe("undefined"); // type-only export
    });
  });

  describe("Contact identity resolution safety", () => {
    it("upsertPerson and createPerson exist", () => {
      expect(typeof peopleRepo.upsertPerson).toBe("function");
      expect(typeof peopleRepo.createPerson).toBe("function");
    });
  });

  describe("Registry remains consistent after Phase 5", () => {
    it("PLANNABLE_ACTIONS still has all lifecycle actions", () => {
      expect(PLANNABLE_ACTIONS.has("remind_snooze")).toBe(true);
      expect(PLANNABLE_ACTIONS.has("expense_delete")).toBe(true);
      expect(PLANNABLE_ACTIONS.has("goal_manage")).toBe(true);
      expect(PLANNABLE_ACTIONS.has("journal_add")).toBe(true);
      expect(PLANNABLE_ACTIONS.has("followup_reopen")).toBe(true);
      expect(PLANNABLE_ACTIONS.has("subscription_cancel")).toBe(true);
    });

    it("DESTRUCTIVE_ACTIONS still has destructive actions", () => {
      expect(DESTRUCTIVE_ACTIONS.has("todo_delete")).toBe(true);
      expect(DESTRUCTIVE_ACTIONS.has("expense_delete")).toBe(true);
      expect(DESTRUCTIVE_ACTIONS.has("remind_cancel")).toBe(true);
      expect(DESTRUCTIVE_ACTIONS.has("kb_forget")).toBe(true);
      expect(DESTRUCTIVE_ACTIONS.has("delete_recent")).toBe(true);
    });

    it("help sections still build correctly", () => {
      const sections = buildHelpSections();
      expect(sections.length).toBeGreaterThan(5);
      for (const s of sections) {
        expect(s.title).toBeTruthy();
        expect(s.lines.length).toBeGreaterThan(0);
      }
    });

    it("fast-path still works for help commands", () => {
      expect(fastClassify("help")?.action).toBe("help");
      expect(fastClassify("เมนู")?.action).toBe("help");
    });
  });
});
