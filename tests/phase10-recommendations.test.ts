import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dashboard = readFileSync(resolve(process.cwd(), "src/app/liff/Dashboard.tsx"), "utf8");
const feedback = readFileSync(resolve(process.cwd(), "src/lib/recommendation/feedback.ts"), "utf8");
const route = readFileSync(resolve(process.cwd(), "src/app/api/dashboard/recommendations/route.ts"), "utf8");

describe("Phase 10 recommendation controls", () => {
  it("records the four feedback outcomes required for measured usefulness", () => {
    expect(feedback).toContain('"accepted" | "dismissed" | "corrected" | "opted_out"');
  });

  it("requires an authenticated user and validates feedback actions", () => {
    expect(route).toContain("requireSessionUser");
    expect(route).toContain("ACTIONS.has");
  });

  it("makes commitment recommendations explicitly owner-controlled", () => {
    expect(dashboard).toContain('recordRecommendation(commitment.id, "accepted")');
    expect(dashboard).toContain('recordRecommendation(commitment.id, "dismissed")');
    expect(dashboard).toContain("ข้อเสนออ่านอย่างเดียว");
  });

  it("does not route recommendation feedback to external communication", () => {
    expect(route).not.toContain("replyText");
    expect(route).not.toContain("send");
  });
});
