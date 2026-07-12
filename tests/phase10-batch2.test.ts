import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const migrations = {
  weekly: read("supabase/migrations/20260712173000_phase10_weekly_plans.sql"),
  radar: read("supabase/migrations/20260712174000_phase10_relationship_signals.sql"),
  documents: read("supabase/migrations/20260712175000_phase10_documents.sql"),
  travel: read("supabase/migrations/20260712176000_phase10_travel_packets.sql"),
  rhythm: read("supabase/migrations/20260712177000_phase10_operating_rhythm.sql"),
};

const repos = {
  weekly: read("src/lib/weekly-plan/repo.ts"),
  radar: read("src/lib/relationship/repo.ts"),
  documents: read("src/lib/document-inbox/repo.ts"),
  travel: read("src/lib/travel/repo.ts"),
  rhythm: read("src/lib/rhythm/repo.ts"),
};

const routes = {
  weekly: read("src/app/api/dashboard/weekly-plans/route.ts"),
  radar: read("src/app/api/dashboard/relationship-radar/route.ts"),
  documents: read("src/app/api/dashboard/documents/route.ts"),
  travel: read("src/app/api/dashboard/travel-packets/route.ts"),
  rhythm: read("src/app/api/dashboard/operating-rhythm/route.ts"),
};

describe("Phase 10 batch 2: Weekly Planning Loop", () => {
  it("migration enforces one plan per (user, week) and status enum", () => {
    expect(migrations.weekly).toContain("unique (user_id, week_start)");
    expect(migrations.weekly).toContain("'draft','proposed','approved','rejected','superseded'");
    expect(migrations.weekly).toContain("enable row level security");
  });

  it("repo exposes decision gate (approved/rejected) without auto-writing tasks", () => {
    expect(repos.weekly).toContain("decideWeeklyPlan");
    expect(repos.weekly).toContain('"approved" | "rejected"');
    expect(repos.weekly).not.toContain("createTodo");
    expect(repos.weekly).not.toContain("replyMessage");
  });

  it("API validates week-start format and decision status", () => {
    expect(routes.weekly).toContain("requireSessionUser");
    expect(routes.weekly).toContain("/^\\d{4}-\\d{2}-\\d{2}$/");
  });
});

describe("Phase 10 batch 2: Relationship Radar", () => {
  it("migration caches signals without enabling autonomous outreach", () => {
    expect(migrations.radar).toContain("open_commitments");
    expect(migrations.radar).toContain("suggested_check_in_days");
    expect(migrations.radar).toContain("references people(id) on delete cascade");
  });

  it("repo joins people for display but never sends messages", () => {
    expect(repos.radar).toContain("people:person_id(name,tier)");
    expect(repos.radar).not.toContain("pushMessage");
    expect(repos.radar).not.toContain("replyMessage");
  });

  it("API is read-only GET with session", () => {
    expect(routes.radar).toContain("requireSessionUser");
    expect(routes.radar).not.toContain("export async function POST");
  });
});

describe("Phase 10 batch 2: Document Inbox", () => {
  it("migration has tsvector + GIN + trigger for cited extraction search", () => {
    expect(migrations.documents).toContain("search_tsv tsvector");
    expect(migrations.documents).toContain("using gin (search_tsv)");
    expect(migrations.documents).toContain("documents_search_tsv_trigger");
    expect(migrations.documents).toContain("search_documents");
  });

  it("repo supports add/list/get/search with user scoping", () => {
    expect(repos.documents).toContain("addDocument");
    expect(repos.documents).toContain("searchDocuments");
    expect(repos.documents).toContain("eq(\"user_id\", userId)");
  });

  it("API validates title + source_type allow-list", () => {
    expect(routes.documents).toContain("title required");
    expect(routes.documents).toContain("SOURCE_TYPES.has");
  });
});

describe("Phase 10 batch 2: Travel Packet", () => {
  it("migration scopes status to planned/active/completed/cancelled and enforces date shape", () => {
    expect(migrations.travel).toContain("'planned','active','completed','cancelled'");
    expect(migrations.travel).toContain("home_timezone");
    expect(migrations.travel).toContain("dest_timezone");
    expect(migrations.travel).toContain("itinerary jsonb");
  });

  it("repo supports status transitions and active scope filter", () => {
    expect(repos.travel).toContain("setTravelPacketStatus");
    expect(repos.travel).toContain('scope === "active"');
  });

  it("API validates endDate >= startDate", () => {
    expect(routes.travel).toContain("body.endDate < body.startDate");
    expect(routes.travel).toContain("requireSessionUser");
  });
});

describe("Phase 10 batch 2: Operating Rhythm", () => {
  it("migration enumerates pattern types and bounds confidence 0..1", () => {
    expect(migrations.rhythm).toContain("'working_hours','energy_peak','energy_low'");
    expect(migrations.rhythm).toContain("confidence between 0 and 1");
    expect(migrations.rhythm).toContain("upsert_operating_rhythm_observation");
  });

  it("observation RPC increments count and confidence toward 1 (diminishing returns)", () => {
    expect(migrations.rhythm).toContain("observed_count + 1");
    expect(migrations.rhythm).toContain("(1.0 - public.operating_rhythm.confidence) * 0.15");
    expect(migrations.rhythm).toContain("least(1.0");
  });

  it("repo defaults to confidence >= 0.6 so only stable patterns surface", () => {
    expect(repos.rhythm).toContain("minConfidence = 0.6");
    expect(repos.rhythm).toContain("supersedePattern");
  });

  it("API exposes GET/DELETE only (no direct write)", () => {
    expect(routes.rhythm).toContain("requireSessionUser");
    expect(routes.rhythm).not.toContain("export async function POST");
  });
});

describe("Phase 10 batch 2: no autonomous external comms across any new API", () => {
  for (const [name, src] of Object.entries(routes)) {
    it(`${name} route has no LINE/QStash/Google writes`, () => {
      expect(src).not.toContain("replyMessage");
      expect(src).not.toContain("pushMessage");
      expect(src).not.toMatch(/googleapis|qstash|client\.messages/);
    });
  }
});
