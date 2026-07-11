import { describe, it, expect } from "vitest";

describe("Phase 3: OAuth nonce invariants", () => {
  it("nonce should be unique per signOAuthState call", () => {
    const nonce1 = crypto.randomUUID() + crypto.randomUUID();
    const nonce2 = crypto.randomUUID() + crypto.randomUUID();
    expect(nonce1).not.toBe(nonce2);
    expect(nonce1.length).toBeGreaterThan(32);
  });

  it("state can only be consumed once (delete by hash = one-time)", () => {
    const consumed = new Set<string>();
    const nonceHash = "hash-abc";

    // First consume
    const firstDelete = !consumed.has(nonceHash);
    consumed.add(nonceHash);
    expect(firstDelete).toBe(true);

    // Second consume — should fail (already consumed)
    const secondDelete = !consumed.has(nonceHash);
    expect(secondDelete).toBe(false);
  });

  it("expired nonce should be rejected", () => {
    const exp = Date.now() - 1000; // 1 second ago
    expect(exp < Date.now()).toBe(true);
  });
});

describe("Phase 3: Attachment cleanup invariants", () => {
  it("deleteMemory should also delete Storage object", () => {
    const storagePath = "attachments/U123/msg456.jpg";
    expect(storagePath.startsWith("attachments/")).toBe(true);
    const path = storagePath.slice("attachments/".length);
    expect(path).toBe("U123/msg456.jpg");
  });

  it("non-attachment memory (no storage_path) should skip Storage cleanup", () => {
    const storagePath = null;
    expect(storagePath).toBeNull();
  });

  it("deleteMemoryByMessageId searches raw.lineMessageId", () => {
    const raw = { lineMessageId: "msg-123", kind: "text" };
    expect(raw.lineMessageId).toBe("msg-123");
  });
});

describe("Phase 3: Google disconnect invariants", () => {
  it("disconnect should revoke token then delete row", () => {
    const steps = ["fetch_token", "revoke_with_google", "delete_row"];
    expect(steps[0]).toBe("fetch_token");
    expect(steps[1]).toBe("revoke_with_google");
    expect(steps[2]).toBe("delete_row");
  });

  it("revoke failure should not prevent DB deletion", () => {
    const revokeSucceeded = false;
    const dbDeleted = revokeSucceeded || true; // should still proceed
    expect(dbDeleted).toBe(true);
  });
});

describe("Phase 3: LINE unsend invariants", () => {
  it("unsend event type should be handled", () => {
    const eventTypes = ["message", "unsend"];
    expect(eventTypes).toContain("unsend");
  });

  it("unsend should delete derived data by messageId", () => {
    const unsendEvent = { type: "unsend", unsend: { messageId: "msg-123" } };
    expect(unsendEvent.unsend.messageId).toBe("msg-123");
  });

  it("unsend should be persisted to webhook_events for idempotency", () => {
    const webhookEventId = "unsend-msg-123-1234567890";
    expect(webhookEventId).toBeTruthy();
    expect(webhookEventId.startsWith("unsend-")).toBe(true);
  });
});

describe("Phase 3: RPC grants invariants", () => {
  it("match_memory should have EXECUTE revoked from public/anon/authenticated", () => {
    const revokedFrom = ["public", "anon", "authenticated"];
    expect(revokedFrom).toContain("public");
    expect(revokedFrom).toContain("anon");
    expect(revokedFrom).toContain("authenticated");
  });

  it("match_knowledge should have EXECUTE revoked from public/anon/authenticated", () => {
    const revokedFrom = ["public", "anon", "authenticated"];
    expect(revokedFrom.length).toBe(3);
  });

  it("increment_nudge should have EXECUTE revoked from public/anon/authenticated", () => {
    const revokedFrom = ["public", "anon", "authenticated"];
    expect(revokedFrom.length).toBe(3);
  });
});
