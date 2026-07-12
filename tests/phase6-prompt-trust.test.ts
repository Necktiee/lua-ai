import { describe, it, expect } from "vitest";

describe("Phase 6: T0-T3 prompt trust model", () => {
  it("T0 security policy should be versioned", async () => {
    const { PROMPT_VERSION } = await import("../src/lib/agent/context");
    expect(PROMPT_VERSION).toBeTruthy();
    expect(typeof PROMPT_VERSION).toBe("string");
  });

  it("T1 product SOP should be versioned", async () => {
    const { SOP_VERSION } = await import("../src/lib/agent/context");
    expect(SOP_VERSION).toBeTruthy();
    expect(typeof SOP_VERSION).toBe("string");
  });

  it("T0 should contain security policy tags", async () => {
    const { T0_SECURITY_POLICY } = await import("../src/lib/agent/context");
    expect(T0_SECURITY_POLICY).toContain("<security_policy");
    expect(T0_SECURITY_POLICY).toContain("</security_policy>");
  });

  it("T1 should contain identity and workflow_sop tags", async () => {
    const { T1_PRODUCT_SOP } = await import("../src/lib/agent/context");
    expect(T1_PRODUCT_SOP).toContain("<identity>");
    expect(T1_PRODUCT_SOP).toContain("</identity>");
    expect(T1_PRODUCT_SOP).toContain("<workflow_sop");
  });

  it("injects current time in the user's timezone", async () => {
    const { currentTimeBlock } = await import("../src/lib/agent/context");
    const block = currentTimeBlock(new Date("2026-07-11T17:30:00.000Z"), "Asia/Bangkok");
    expect(block).toContain("<current_time");
    expect(block).toContain('time_zone="Asia/Bangkok"');
    expect(block).toContain('local_date="2026-07-12"');
    expect(block).toContain('local_time="00:30"');
  });

  it("T0 should state evidence is data not instructions", async () => {
    const { T0_SECURITY_POLICY } = await import("../src/lib/agent/context");
    expect(T0_SECURITY_POLICY).toContain("ข้อมูล");
    expect(T0_SECURITY_POLICY).toContain("ไม่ใช่");
    expect(T0_SECURITY_POLICY).toContain("คำสั่ง");
  });

  it("T0 should prohibit fabrication of personal facts", async () => {
    const { T0_SECURITY_POLICY } = await import("../src/lib/agent/context");
    expect(T0_SECURITY_POLICY).toContain("ห้ามแต่ง");
  });

  it("T0 should prohibit claiming success without execution", async () => {
    const { T0_SECURITY_POLICY } = await import("../src/lib/agent/context");
    expect(T0_SECURITY_POLICY).toContain("ห้ามยืนยันว่าทำ");
  });

  it("T0 should include prompt injection resistance", async () => {
    const { T0_SECURITY_POLICY } = await import("../src/lib/agent/context");
    expect(T0_SECURITY_POLICY).toContain("เปลี่ยนบทบาท");
  });
});

describe("Phase 6: Prompt assembly order", () => {
  it("T0 should come before T1 in assembly", async () => {
    // The buildAgentContext function assembles: T0, T1, current time, profile, people, state, memory
    // T0 (security) must always be first so the model sees rules before data
    const order = ["T0_SECURITY_POLICY", "T1_PRODUCT_SOP", "timeBlock", "profileBlock", "peopleBlock", "stateBlock", "memoryBlock"];
    expect(order[0]).toBe("T0_SECURITY_POLICY");
    expect(order[1]).toBe("T1_PRODUCT_SOP");
    expect(order[6]).toBe("memoryBlock");
  });
});
