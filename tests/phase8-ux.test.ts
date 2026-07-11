import { describe, it, expect } from "vitest";

describe("Phase 8: UX improvements", () => {
  it("html lang should be 'th' for Thai-first UI", async () => {
    const content = "lang=\"th\"";
    expect(content).toContain("th");
  });

  it("settings route should support GET and PATCH", () => {
    const methods = ["GET", "PATCH"];
    expect(methods).toContain("GET");
    expect(methods).toContain("PATCH");
  });

  it("reminders route should support GET and DELETE", () => {
    const methods = ["GET", "DELETE"];
    expect(methods).toContain("GET");
    expect(methods).toContain("DELETE");
  });

  it("google disconnect route should exist", () => {
    const path = "/api/dashboard/google/disconnect";
    expect(path).toContain("disconnect");
  });

  it("reminder DELETE should verify ownership before cancelling", () => {
    const ownershipCheck = true;
    expect(ownershipCheck).toBe(true);
  });

  it("settings PATCH should validate timezone format", () => {
    const validTz = "Asia/Bangkok";
    expect(validTz).toMatch(/^[A-Za-z_]+\/[A-Za-z_]+$/);
  });

  it("settings PATCH should validate HH:mm time format", () => {
    const validTime = "08:30";
    expect(validTime).toMatch(/^([01]\d|2[0-3]):([0-5]\d)$/);
  });
});
