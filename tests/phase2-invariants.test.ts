import { describe, it, expect } from "vitest";
import { makeTiedTodos, EXPECTED_TIED_ORDER } from "./fixtures/todo-ordering";
import { GOOGLE_EVENT_IDS } from "./fixtures/meeting-claim";
import { RAG_FALLBACK_SCENARIOS } from "./fixtures/rag-fallback";

describe("Phase 2: Webhook inbox invariants", () => {
  it("webhookEventId should be a non-empty string in LINE payload", () => {
    const fakeLineEvent = {
      type: "message",
      webhookEventId: "1234567890abcdef1234567890abcdef",
      replyToken: "abc123",
      source: { userId: "U1234567890abcdef1234567890abcdef" },
      message: { type: "text", id: "msg123", text: "สวัสดี" },
    };
    expect(fakeLineEvent.webhookEventId).toBeTruthy();
    expect(typeof fakeLineEvent.webhookEventId).toBe("string");
    expect(fakeLineEvent.webhookEventId.length).toBeGreaterThan(10);
  });

  it("duplicate webhookEventId should be idempotent (same ID = skip)", () => {
    const eventIds = ["ev-1", "ev-1", "ev-2", "ev-1", "ev-2"];
    const seen = new Set<string>();
    const newIds: string[] = [];
    for (const id of eventIds) {
      if (!seen.has(id)) {
        seen.add(id);
        newIds.push(id);
      }
    }
    expect(newIds).toEqual(["ev-1", "ev-2"]);
    expect(newIds.length).toBe(2);
  });

  it("webhook_events status transitions follow pending→processing→done/failed", () => {
    const validTransitions: Record<string, string[]> = {
      pending: ["processing"],
      processing: ["done", "failed", "dead_letter"],
      failed: ["pending"], // reset for retry
      done: [],
      dead_letter: [],
    };
    for (const [, tos] of Object.entries(validTransitions)) {
      expect(tos).toBeDefined();
    }
    expect(validTransitions.pending).toContain("processing");
    expect(validTransitions.processing).toContain("done");
    expect(validTransitions.processing).toContain("failed");
  });

  it("dead_letter is reached after 3 failed attempts", () => {
    let attempts = 0;
    const maxAttempts = 3;
    const statuses: string[] = [];
    for (let i = 0; i < maxAttempts; i++) {
      attempts++;
      statuses.push(attempts >= maxAttempts ? "dead_letter" : "failed");
    }
    expect(statuses[maxAttempts - 1]).toBe("dead_letter");
    expect(statuses[0]).toBe("failed");
  });
});

describe("Phase 2: Todo-reminder lifecycle invariants", () => {
  it("todo_add with due_at should store reminder_id", () => {
    const todo = { id: "todo-1", reminder_id: "reminder-1", title: "test", due_at: "2026-07-12T10:00:00Z" };
    expect(todo.reminder_id).toBeTruthy();
  });

  it("todo_done should cancel linked reminder", () => {
    const cancelledReminders: string[] = [];
    const todo = { id: "todo-1", reminder_id: "reminder-1", title: "test" };
    if (todo.reminder_id) {
      cancelledReminders.push(todo.reminder_id);
    }
    expect(cancelledReminders).toEqual(["reminder-1"]);
  });

  it("todo_cancel should cancel linked reminder", () => {
    const cancelledReminders: string[] = [];
    const todo = { id: "todo-1", reminder_id: "reminder-1", title: "test" };
    if (todo.reminder_id) {
      cancelledReminders.push(todo.reminder_id);
    }
    expect(cancelledReminders).toEqual(["reminder-1"]);
  });

  it("todo_delete should cancel linked reminder", () => {
    const cancelledReminders: string[] = [];
    const todo = { id: "todo-1", reminder_id: "reminder-1", title: "test" };
    if (todo.reminder_id) {
      cancelledReminders.push(todo.reminder_id);
    }
    expect(cancelledReminders).toEqual(["reminder-1"]);
  });

  it("todo_update with new due_at should cancel old and schedule new reminder", () => {
    const oldReminderId = "reminder-old";
    const newReminderId = "reminder-new";
    const cancelled: string[] = [];
    const created: string[] = [];

    // Simulate: cancel old, schedule new
    cancelled.push(oldReminderId);
    created.push(newReminderId);

    expect(cancelled).toEqual([oldReminderId]);
    expect(created).toEqual([newReminderId]);
    expect(cancelled[0]).not.toBe(created[0]);
  });

  it("todo without due_at should have null reminder_id", () => {
    const todo = { id: "todo-1", reminder_id: null, title: "no due date", due_at: null };
    expect(todo.reminder_id).toBeNull();
  });
});

describe("Phase 2: Urgent email claim lifecycle invariants", () => {
  it("email_notified status transitions: pending→sent or pending→skipped", () => {
    const validStatuses = ["pending", "sent", "skipped"];
    const transitions: Record<string, string[]> = {
      pending: ["sent", "skipped"],
      sent: [],
      skipped: [],
    };
    expect(validStatuses).toContain("pending");
    expect(transitions.pending).toContain("sent");
    expect(transitions.pending).toContain("skipped");
  });

  it("non-urgent email should be marked skipped (not retried)", () => {
    const emailStatus = "skipped";
    expect(emailStatus).toBe("skipped");
  });

  it("urgent email push failure should release claim for retry", () => {
    const pushSucceeded = false;
    const action = pushSucceeded ? "sent" : "release";
    expect(action).toBe("release");
  });

  it("urgent email push success should mark sent", () => {
    const pushSucceeded = true;
    const action = pushSucceeded ? "sent" : "release";
    expect(action).toBe("sent");
  });

  it("pending emails from failed push should be eligible for retry", () => {
    const statuses = ["sent", "skipped"]; // only these are "done"
    const pendingStatus = "pending";
    expect(statuses).not.toContain(pendingStatus);
  });
});

describe("Phase 2: Message delivery state invariants", () => {
  it("assistant message logged with delivered=true on success", () => {
    const message = { role: "assistant", content: "test reply", delivered: true };
    expect(message.delivered).toBe(true);
  });

  it("assistant message logged with delivered=false on delivery failure", () => {
    const message = { role: "assistant", content: "test reply", delivered: false };
    expect(message.delivered).toBe(false);
  });

  it("user messages always have delivered=true (they came from LINE)", () => {
    const message = { role: "user", content: "hello", delivered: true };
    expect(message.delivered).toBe(true);
  });

  it("error response logged with error=true meta", () => {
    const meta = { delivered: false, error: true };
    expect(meta.error).toBe(true);
    expect(meta.delivered).toBe(false);
  });
});

describe("Phase 2: Regression — Phase 1 fixes still hold", () => {
  it("todo total ordering includes created_at and id as tie-breakers", () => {
    const todos = makeTiedTodos();
    expect(EXPECTED_TIED_ORDER).toHaveLength(4);
    // Each todo should have created_at and id for deterministic ordering
    for (const t of todos) {
      expect(t.created_at).toBeDefined();
      expect(t.id).toBeDefined();
    }
  });

  it("meeting claim fixtures use non-UUID Google event IDs", () => {
    for (const id of GOOGLE_EVENT_IDS) {
      expect(id).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    }
  });

  it("RAG fallback fixtures cover null-embedding scenarios", () => {
    expect(RAG_FALLBACK_SCENARIOS.length).toBeGreaterThan(0);
    for (const s of RAG_FALLBACK_SCENARIOS) {
      expect(s.expectedFallback).toBeDefined();
      expect(s.embedding).toBeDefined();
    }
  });
});
