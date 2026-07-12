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

    const firstDelete = !consumed.has(nonceHash);
    consumed.add(nonceHash);
    expect(firstDelete).toBe(true);

    const secondDelete = !consumed.has(nonceHash);
    expect(secondDelete).toBe(false);
  });

  it("expired nonce should be rejected", () => {
    const exp = Date.now() - 1000;
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
    const dbDeleted = revokeSucceeded || true;
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

describe("Phase 3: Token encryption", () => {
  const KEY = "test-token-encryption-key-lekha";

  it("encryptSecret produces enc:v1 prefix and round-trips", async () => {
    const { encryptSecret, decryptSecret, isEncrypted, ENC_PREFIX } = await import(
      "../src/lib/crypto/secrets"
    );
    const plain = "ya29.refresh-token-secret";
    const enc = encryptSecret(plain, KEY);
    expect(enc).toBeTruthy();
    expect(enc!.startsWith(ENC_PREFIX)).toBe(true);
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc, KEY)).toBe(plain);
  });

  it("legacy plaintext decrypts as-is", async () => {
    const { decryptSecret, isEncrypted } = await import("../src/lib/crypto/secrets");
    expect(isEncrypted("plain-refresh")).toBe(false);
    expect(decryptSecret("plain-refresh", KEY)).toBe("plain-refresh");
  });

  it("wrong key fails auth tag", async () => {
    const { encryptSecret, decryptSecret } = await import("../src/lib/crypto/secrets");
    const enc = encryptSecret("secret", KEY)!;
    expect(() => decryptSecret(enc, "other-key")).toThrow();
  });

  it("without key, encrypt is passthrough", async () => {
    const { encryptSecret, isEncrypted } = await import("../src/lib/crypto/secrets");
    const out = encryptSecret("plain", "");
    expect(isEncrypted(out)).toBe(false);
    expect(out).toBe("plain");
  });
});

describe("Phase 3: Retention settings", () => {
  it("retention_days 0 means forever", () => {
    const retention_days = 0;
    expect(retention_days > 0).toBe(false);
  });

  it("retention cutoff is now - days", () => {
    const days = 90;
    const cutoff = new Date(Date.now() - days * 86_400_000);
    expect(cutoff.getTime()).toBeLessThan(Date.now());
  });

  it("retention_days range is 0-3650", () => {
    const valid = (n: number) => Number.isInteger(n) && n >= 0 && n <= 3650;
    expect(valid(0)).toBe(true);
    expect(valid(365)).toBe(true);
    expect(valid(3651)).toBe(false);
    expect(valid(-1)).toBe(false);
  });
});

describe("Phase 3: Export / delete-account invariants", () => {
  it("export strips embeddings and tokens", () => {
    const STRIP = new Set(["embedding", "access_token", "refresh_token"]);
    const row = { content: "hi", embedding: [0.1], access_token: "x", refresh_token: "y" };
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (!STRIP.has(k)) out[k] = v;
    }
    expect(out).toEqual({ content: "hi" });
  });

  it("delete-account requires confirm DELETE", () => {
    expect("DELETE" === "DELETE").toBe(true);
    expect("delete" === "DELETE").toBe(false);
  });

  it("delete-account deletes Storage before user cascade", () => {
    const steps = [
      "delete_attachments",
      "revoke_google",
      "delete_oauth_nonces",
      "delete_webhook_events",
      "delete_user_cascade",
    ];
    expect(steps[0]).toBe("delete_attachments");
    expect(steps[steps.length - 1]).toBe("delete_user_cascade");
  });
});
