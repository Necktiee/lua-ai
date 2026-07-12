import { describe, it, expect } from "vitest";
import { makeTiedTodos, EXPECTED_TIED_ORDER } from "./fixtures/todo-ordering";
import { GOOGLE_EVENT_IDS, UUID_EVENT_ID } from "./fixtures/meeting-claim";
import { RAG_FALLBACK_SCENARIOS } from "./fixtures/rag-fallback";

describe("P0 fixture: todo ordering", () => {
  it("creates 4 tied-priority todos with null and equal due dates", () => {
    const todos = makeTiedTodos();
    expect(todos).toHaveLength(4);
    expect(todos.every((t) => t.priority === 2)).toBe(true);
    expect(todos.every((t) => t.status === "pending")).toBe(true);
  });

  it("has at least 2 todos with null due_at (the unstable-tie case)", () => {
    const todos = makeTiedTodos();
    const nullDue = todos.filter((t) => t.due_at === null);
    expect(nullDue.length).toBeGreaterThanOrEqual(2);
  });

  it("has at least 2 todos with identical due_at (the equal-due-tie case)", () => {
    const todos = makeTiedTodos();
    const dueDates = todos.filter((t) => t.due_at !== null).map((t) => t.due_at);
    const unique = new Set(dueDates);
    expect(dueDates.length).toBeGreaterThanOrEqual(2);
    expect(unique.size).toBeLessThan(dueDates.length);
  });

  it("expected order references all fixture IDs exactly once", () => {
    const todos = makeTiedTodos();
    const ids = new Set(todos.map((t) => t.id));
    for (const expectedId of EXPECTED_TIED_ORDER) {
      expect(ids.has(expectedId)).toBe(true);
    }
    expect(EXPECTED_TIED_ORDER).toHaveLength(todos.length);
  });
});

describe("P0 fixture: meeting claim Google event IDs", () => {
  it("includes non-UUID Google event IDs that fail on UUID columns", () => {
    expect(GOOGLE_EVENT_IDS.length).toBeGreaterThan(0);
    for (const id of GOOGLE_EVENT_IDS) {
      expect(id).not.toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    }
  });

  it("includes a UUID event ID for comparison", () => {
    expect(UUID_EVENT_ID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

describe("P0 fixture: RAG fallback scenarios", () => {
  it("includes a null-embedding scenario that must trigger text fallback", () => {
    const nullEmbedding = RAG_FALLBACK_SCENARIOS.find((s) => s.embedding === null && s.expectedFallback);
    expect(nullEmbedding).toBeDefined();
  });

  it("includes a valid-embedding low-similarity scenario that must NOT fallback", () => {
    const noFallback = RAG_FALLBACK_SCENARIOS.find((s) => s.embedding !== null && !s.expectedFallback);
    expect(noFallback).toBeDefined();
  });
});

describe("Phase 0: Schedule health invariants", () => {
  it("CRON_ROUTES lists all product cron paths", async () => {
    const { CRON_ROUTES, CRON_ROUTE_PATHS } = await import("../src/lib/cron/routes");
    expect(CRON_ROUTES.length).toBeGreaterThanOrEqual(10);
    expect(CRON_ROUTE_PATHS).toContain("/api/cron/poll");
    expect(CRON_ROUTE_PATHS).toContain("/api/cron/briefing");
    expect(CRON_ROUTE_PATHS).toContain("/api/cron/evening");
    expect(CRON_ROUTE_PATHS).toContain("/api/cron/daily");
    expect(CRON_ROUTE_PATHS).toContain("/api/cron/journal");
    expect(CRON_ROUTE_PATHS).toContain("/api/cron/nudge");
    expect(CRON_ROUTE_PATHS).toContain("/api/cron/meeting");
    expect(CRON_ROUTE_PATHS).toContain("/api/cron/weekly");
    expect(CRON_ROUTE_PATHS).toContain("/api/cron/email");
    expect(CRON_ROUTE_PATHS).toContain("/api/cron/embed");
  });

  it("each route has id, cron, and description", async () => {
    const { CRON_ROUTES } = await import("../src/lib/cron/routes");
    for (const r of CRON_ROUTES) {
      expect(r.id).toMatch(/^lua-ai-/);
      expect(r.cron).toBeTruthy();
      expect(r.description.length).toBeGreaterThan(5);
    }
  });
});
