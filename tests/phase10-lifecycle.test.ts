import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const decisionRepo = readFileSync(resolve(process.cwd(), "src/lib/decision/repo.ts"), "utf8");
const decisionRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/dashboard/decisions/route.ts"),
  "utf8",
);
const meetingRepo = readFileSync(resolve(process.cwd(), "src/lib/meeting/repo.ts"), "utf8");
const meetingRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/dashboard/meetings/route.ts"),
  "utf8",
);
const focusRepo = readFileSync(resolve(process.cwd(), "src/lib/focus/repo.ts"), "utf8");
const focusRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/dashboard/focus-windows/route.ts"),
  "utf8",
);
const correctionRepo = readFileSync(
  resolve(process.cwd(), "src/lib/correction/repo.ts"),
  "utf8",
);
const correctionRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/dashboard/corrections/route.ts"),
  "utf8",
);
const meetingMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260712170000_phase10_meetings.sql"),
  "utf8",
);
const focusMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260712171000_phase10_focus_windows.sql"),
  "utf8",
);
const correctionMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260712172000_phase10_corrections.sql"),
  "utf8",
);

describe("Phase 10: Decision Journal lifecycle", () => {
  it("exposes listOpenDecisions and reviewDecision alongside existing APIs", () => {
    expect(decisionRepo).toContain("listOpenDecisions");
    expect(decisionRepo).toContain("reviewDecision");
    expect(decisionRepo).toContain("reviewed");
    expect(decisionRepo).toContain("superseded");
  });

  it("API enforces session + outcome validation", () => {
    expect(decisionRoute).toContain("requireSessionUser");
    expect(decisionRoute).toContain("outcome required");
    expect(decisionRoute).not.toContain("replyText");
  });
});

describe("Phase 10: Meeting Copilot foundation", () => {
  it("migration creates meetings table with RLS + touch trigger + cascade FK", () => {
    expect(meetingMigration).toContain("create table if not exists public.meetings");
    expect(meetingMigration).toContain("references users(line_user_id) on delete cascade");
    expect(meetingMigration).toContain("enable row level security");
    expect(meetingMigration).toContain("meetings_owner_select");
    expect(meetingMigration).toContain("meetings_touch");
  });

  it("repo scopes by user_id and exposes listRecentMeetings/getMeeting/addMeeting", () => {
    expect(meetingRepo).toContain("eq(\"user_id\", userId)");
    expect(meetingRepo).toContain("listRecentMeetings");
    expect(meetingRepo).toContain("addMeeting");
    expect(meetingRepo).toContain("touchUser");
  });

  it("API requires session and validates title", () => {
    expect(meetingRoute).toContain("requireSessionUser");
    expect(meetingRoute).toContain("title required");
  });
});

describe("Phase 10: Focus Defense", () => {
  it("migration enforces minute range and end>start invariant", () => {
    expect(focusMigration).toContain("between 0 and 1439");
    expect(focusMigration).toContain("end_minute > start_minute");
    expect(focusMigration).toContain("priority_threshold");
  });

  it("repo exposes isFocusBlocked for read-only interruption gate", () => {
    expect(focusRepo).toContain("isFocusBlocked");
    expect(focusRepo).toContain("eq(\"enabled\", true)");
    expect(focusRepo).not.toContain("replyMessage");
  });

  it("API validates day-of-week range and minute ordering", () => {
    expect(focusRoute).toContain("body.dayOfWeek < 0");
    expect(focusRoute).toContain("body.endMinute <= body.startMinute");
    expect(focusRoute).toContain("requireSessionUser");
  });
});

describe("Phase 10: Correction Learning Loop", () => {
  it("migration restricts feature and correction_type to enumerated values", () => {
    expect(correctionMigration).toContain("'memory_summary','reminder','commitment','decision'");
    expect(correctionMigration).toContain("'rewrite','reject','refine','confirm'");
    expect(correctionMigration).toContain("count_corrections_by_feature");
  });

  it("repo records corrections and exposes counts RPC", () => {
    expect(correctionRepo).toContain("recordCorrection");
    expect(correctionRepo).toContain("countCorrectionsByFeature");
    expect(correctionRepo).toContain("CorrectionFeature");
  });

  it("API enforces feature allow-list + non-empty outputs", () => {
    expect(correctionRoute).toContain("FEATURES.has");
    expect(correctionRoute).toContain("originalOutput");
    expect(correctionRoute).toContain("correctedOutput");
    expect(correctionRoute).not.toContain("pushMessage");
  });
});

describe("Phase 10: Commitment Ledger enrichment", () => {
  it("commitment repo exposes overdue + review-due queries", () => {
    const repo = readFileSync(resolve(process.cwd(), "src/lib/commitment/repo.ts"), "utf8");
    expect(repo).toContain("listOverdueCommitments");
    expect(repo).toContain("listCommitmentsDueForReview");
    expect(repo).toContain("lt(\"due_at\", now.toISOString())");
  });
});
