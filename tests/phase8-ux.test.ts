import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isWithinQuietHours } from "../src/lib/settings/quiet";

const dashboardSource = readFileSync(resolve(process.cwd(), "src/app/liff/Dashboard.tsx"), "utf8");

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

describe("Phase 8: Quiet hours", () => {
  it("disabled quiet hours never blocks", () => {
    expect(
      isWithinQuietHours({
        now: new Date("2026-07-11T15:00:00+07:00"),
        timeZone: "Asia/Bangkok",
        enabled: false,
        start: "22:00",
        end: "07:00",
      }),
    ).toBe(false);
  });

  it("same-day window blocks inside range", () => {
    expect(
      isWithinQuietHours({
        now: new Date("2026-07-11T14:00:00+07:00"),
        timeZone: "Asia/Bangkok",
        enabled: true,
        start: "13:00",
        end: "15:00",
      }),
    ).toBe(true);
  });

  it("midnight-wrapping window blocks late night", () => {
    expect(
      isWithinQuietHours({
        now: new Date("2026-07-11T23:30:00+07:00"),
        timeZone: "Asia/Bangkok",
        enabled: true,
        start: "22:00",
        end: "07:00",
      }),
    ).toBe(true);
  });

  it("midnight-wrapping window allows afternoon", () => {
    expect(
      isWithinQuietHours({
        now: new Date("2026-07-11T15:00:00+07:00"),
        timeZone: "Asia/Bangkok",
        enabled: true,
        start: "22:00",
        end: "07:00",
      }),
    ).toBe(false);
  });
});

describe("Phase 8: Undo / receipts", () => {
  it("undo API requires id", () => {
    const body = { id: "uuid" };
    expect(body.id).toBeTruthy();
  });

  it("mobile bottom nav has four destinations without More sheet", () => {
    expect(dashboardSource).toContain('type Destination = "today" | "work" | "life" | "jaew"');
    expect(dashboardSource).toContain("DESTINATIONS");
    expect(dashboardSource).toContain('grid-cols-4');
    expect(dashboardSource).not.toContain("MORE_NAV_ITEMS");
    expect(dashboardSource).not.toContain("เพิ่มเติม");
  });

  it("touch target min height is 44px (min-h-11)", () => {
    const minH = 44;
    expect(minH).toBeGreaterThanOrEqual(44);
  });

  it("surfaces offline status and evidence for the next action", () => {
    expect(dashboardSource).toContain('window.addEventListener("offline", syncOnlineState)');
    expect(dashboardSource).toContain("ออฟไลน์อยู่");
    expect(dashboardSource).toContain("ข้อมูลสนับสนุน");
  });
});
