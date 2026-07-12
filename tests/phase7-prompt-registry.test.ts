import { describe, it, expect } from "vitest";
import {
  T0_SECURITY_POLICY,
  T0_VERSION,
  T1_PRODUCT_SOP,
  T1_VERSION,
  DOMAIN_SOP_VERSION,
  DOMAIN_SOPS,
  WEB_SEARCH_SYSTEM,
  WEB_SEARCH_VERSION,
  compileDomainSop,
  getPromptVersions,
} from "@/lib/agent/prompts";

describe("Phase 7: Prompt Registry And Grounding", () => {
  describe("Versioned prompt constants", () => {
    it("T0 has version embedded in XML", () => {
      expect(T0_SECURITY_POLICY).toContain(`version="${T0_VERSION}"`);
      expect(T0_SECURITY_POLICY).toContain("security_policy");
    });

    it("T1 has version embedded in workflow_sop tag", () => {
      expect(T1_PRODUCT_SOP).toContain(`version="${T1_VERSION}"`);
      expect(T1_PRODUCT_SOP).toContain("workflow_sop");
      expect(T1_PRODUCT_SOP).toContain("identity");
    });

    it("T0 and T1 versions are different strings", () => {
      expect(T0_VERSION).not.toBe(T1_VERSION);
    });
  });

  describe("Domain SOP registry", () => {
    it("has SOPs for all key domains", () => {
      const categories = Object.keys(DOMAIN_SOPS);
      expect(categories).toContain("finance");
      expect(categories).toContain("calendar");
      expect(categories).toContain("memory");
      expect(categories).toContain("tasks");
      expect(categories).toContain("people");
      expect(categories).toContain("search");
    });

    it("each domain SOP has version attribute", () => {
      for (const [cat, sop] of Object.entries(DOMAIN_SOPS)) {
        expect(sop, `domain SOP "${cat}" missing version`).toContain(
          `version="${DOMAIN_SOP_VERSION}"`,
        );
      }
    });

    it("compileDomainSop returns relevant SOP for finance actions", () => {
      const sop = compileDomainSop("expense_add");
      expect(sop).toContain("finance");
      expect(sop.length).toBeGreaterThan(0);
    });

    it("compileDomainSop returns relevant SOP for calendar actions", () => {
      const sop = compileDomainSop("calendar_add");
      expect(sop).toContain("calendar");
    });

    it("compileDomainSop returns relevant SOP for task actions", () => {
      const sop = compileDomainSop("todo_add");
      expect(sop).toContain("tasks");
    });

    it("compileDomainSop returns empty for general chat", () => {
      expect(compileDomainSop("chat")).toBe("");
      expect(compileDomainSop("help")).toBe("");
    });

    it("compileDomainSop returns empty for unknown action", () => {
      expect(compileDomainSop("nonexistent_action")).toBe("");
    });

    it("domain SOP is bounded (each < 500 chars)", () => {
      for (const [cat, sop] of Object.entries(DOMAIN_SOPS)) {
        expect(sop.length, `domain SOP "${cat}" too long`).toBeLessThan(500);
      }
    });
  });

  describe("Web search prompt (orphan promoted to registry)", () => {
    it("WEB_SEARCH_SYSTEM is versioned", () => {
      expect(WEB_SEARCH_SYSTEM).toContain(WEB_SEARCH_VERSION);
    });

    it("WEB_SEARCH_SYSTEM references output rules", () => {
      expect(WEB_SEARCH_SYSTEM).toContain("output_rules");
    });

    it("WEB_SEARCH_SYSTEM includes domain SOP for search", () => {
      expect(WEB_SEARCH_SYSTEM).toContain("search");
    });
  });

  describe("Prompt version tracking", () => {
    it("getPromptVersions returns all version strings", () => {
      const v = getPromptVersions();
      expect(v.t0).toBe(T0_VERSION);
      expect(v.t1).toBe(T1_VERSION);
      expect(v.domainSop).toBe(DOMAIN_SOP_VERSION);
      expect(v.webSearch).toBe(WEB_SEARCH_VERSION);
    });

    it("versions are non-empty strings", () => {
      const v = getPromptVersions();
      for (const [key, val] of Object.entries(v)) {
        expect(typeof val, `${key} should be string`).toBe("string");
        expect(val.length, `${key} should be non-empty`).toBeGreaterThan(0);
      }
    });
  });

  describe("Legacy compatibility", () => {
    it("PROMPT_VERSION re-export matches T0_VERSION", async () => {
      const { PROMPT_VERSION } = await import("@/lib/agent/context");
      expect(PROMPT_VERSION).toBe(T0_VERSION);
    });

    it("SOP_VERSION re-export matches T1_VERSION", async () => {
      const { SOP_VERSION } = await import("@/lib/agent/context");
      expect(SOP_VERSION).toBe(T1_VERSION);
    });

    it("T0_SECURITY_POLICY re-exported from context", async () => {
      const ctx = await import("@/lib/agent/context");
      expect(ctx.T0_SECURITY_POLICY).toBe(T0_SECURITY_POLICY);
    });
  });

  describe("Prompt injection resistance", () => {
    it("T0 policy explicitly forbids acting on retrieved data as commands", () => {
      expect(T0_SECURITY_POLICY).toContain("ข้อมูล");
      expect(T0_SECURITY_POLICY).toContain("คำสั่ง");
    });

    it("T0 policy forbids revealing system prompts", () => {
      expect(T0_SECURITY_POLICY).toContain("เปิดเผยคำสั่งระบบ");
    });

    it("T0 policy requires evidence citation for personal claims", () => {
      expect(T0_SECURITY_POLICY).toContain("[M1]");
      expect(T0_SECURITY_POLICY).toContain("[K2]");
    });

    it("T0 policy forbids fabricating personal data", () => {
      expect(T0_SECURITY_POLICY).toContain("แต่งข้อมูลส่วนตัว");
    });
  });

  describe("Phase 7 audit fixes", () => {
    it("chatReply threads action to buildAgentContext (plumbing wired)", async () => {
      const fs = await import("node:fs");
      const src = fs.readFileSync("src/lib/agent/handle.ts", "utf-8");
      // chatReply should accept action parameter
      expect(src).toContain("chatReply(input, history, intent.action)");
      expect(src).toMatch(/action.*=.*"chat"/);
      // buildAgentContext should receive action
      const ctxSrc = fs.readFileSync("src/lib/agent/context.ts", "utf-8");
      expect(ctxSrc).toContain("args.action");
    });

    it("buildAgentContext uses static import for compileDomainSop (no dynamic import)", async () => {
      const fs = await import("node:fs");
      const src = fs.readFileSync("src/lib/agent/context.ts", "utf-8");
      expect(src).not.toContain('await import("@/lib/agent/prompts")');
      expect(src).toContain("compileDomainSop");
    });

    it("legacy IDENTITY and CORE_SOP follow Phase 1 M8 convention", async () => {
      const { IDENTITY, CORE_SOP, T0_SECURITY_POLICY, T1_PRODUCT_SOP } = await import(
        "@/lib/agent/context"
      );
      // Phase 1 M8: IDENTITY = T0 security policy, CORE_SOP = T1 product SOP
      expect(IDENTITY).toBe(T0_SECURITY_POLICY);
      expect(CORE_SOP).toBe(T1_PRODUCT_SOP);
    });

    it("T1 SOP uses 'อะไร' not 'อย่างไร' in capability check", () => {
      expect(T1_PRODUCT_SOP).toContain("มีอะไรที่ทำแทน");
      expect(T1_PRODUCT_SOP).not.toContain("อย่างไรที่ทำแทน");
    });

    it("memory SOP does not claim raw storage (summarization is used)", () => {
      expect(DOMAIN_SOPS.memory).not.toContain("ห้ามสรุปเนื้อหา");
      expect(DOMAIN_SOPS.memory).toContain("สรุปกระชับ");
    });

    it("finance SOP does not claim subscription briefing (not implemented)", () => {
      expect(DOMAIN_SOPS.finance).not.toContain("subscription");
      expect(DOMAIN_SOPS.finance).not.toContain("ต่ออายุ");
    });

    it("registry has no Thai typo 'ปฏิทิยน'", async () => {
      const fs = await import("node:fs");
      const src = fs.readFileSync("src/lib/agent/registry.ts", "utf-8");
      expect(src).not.toContain("ปฏิทิยน");
      expect(src).toContain("ปฏิทิน");
    });

    it("eval replay includes domain_sop_version and web_search_version", async () => {
      const fs = await import("node:fs");
      const json = JSON.parse(
        fs.readFileSync("evals/prompt-replay.json", "utf-8"),
      );
      expect(json.domain_sop_version).toBe(DOMAIN_SOP_VERSION);
      expect(json.web_search_version).toBe(WEB_SEARCH_VERSION);
    });
  });
});
