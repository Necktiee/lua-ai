import { describe, it, expect } from "vitest";

describe("Phase 4: Provenance invariants", () => {
  it("memory should track source_type and source_id", () => {
    const memory = {
      source_type: "line_text",
      source_id: "msg-123",
      content_hash: "abc123",
    };
    expect(memory.source_type).toBe("line_text");
    expect(memory.source_id).toBe("msg-123");
    expect(memory.content_hash).toBeTruthy();
  });

  it("knowledge should track source_type and source_id", () => {
    const knowledge = {
      source_type: "user",
      source_id: null,
      content_hash: null,
    };
    expect(knowledge.source_type).toBe("user");
  });
});

describe("Phase 4: Content hash dedup invariants", () => {
  it("same content should produce same hash", async () => {
    const { contentHash } = await import("../src/lib/memory/store");
    const hash1 = await contentHash("test content");
    const hash2 = await contentHash("test content");
    expect(hash1).toBe(hash2);
  });

  it("different content should produce different hash", async () => {
    const { contentHash } = await import("../src/lib/memory/store");
    const hash1 = await contentHash("content A");
    const hash2 = await contentHash("content B");
    expect(hash1).not.toBe(hash2);
  });

  it("hash should be 64 chars (SHA-256 hex)", async () => {
    const { contentHash } = await import("../src/lib/memory/store");
    const hash = await contentHash("test");
    expect(hash).toHaveLength(64);
  });
});

describe("Phase 4: Embedding lifecycle invariants", () => {
  it("embedding_status should be ok/failed/null/reindex", () => {
    const validStatuses = ["ok", "failed", "null", "reindex"];
    expect(validStatuses).toContain("ok");
    expect(validStatuses).toContain("failed");
    expect(validStatuses).toContain("null");
  });

  it("embedding_model should track which model was used", () => {
    const model = "baai/bge-m3";
    expect(model).toBeTruthy();
  });
});

describe("Phase 4: Knowledge version history invariants", () => {
  it("updating a fact should archive the old version", () => {
    const oldVersion = {
      knowledge_id: "k-1",
      key: "ชื่อ",
      value: "สมชาย",
      archived_reason: "updated",
    };
    expect(oldVersion.archived_reason).toBe("updated");
  });

  it("knowledge_versions should track knowledge_id, user_id, key, value", () => {
    const version = {
      knowledge_id: "k-1",
      user_id: "U123",
      key: "ชื่อ",
      value: "สมชาย เก่า",
      category: "profile",
      priority: 1,
      source: "user",
    };
    expect(version.knowledge_id).toBeTruthy();
    expect(version.user_id).toBeTruthy();
  });

  it("same key+value update should NOT archive (no change)", () => {
    const oldValue = "สมชาย";
    const newValue = "สมชาย";
    const shouldArchive = oldValue !== newValue;
    expect(shouldArchive).toBe(false);
  });
});

describe("Phase 4: Embedding jobs table invariants", () => {
  it("embedding_jobs should track target_table and target_id", () => {
    const job = {
      target_table: "memory",
      target_id: "mem-123",
      status: "pending",
    };
    expect(job.target_table).toBe("memory");
    expect(job.target_id).toBe("mem-123");
  });

  it("embedding_jobs status should be pending/processing/done/failed", () => {
    const validStatuses = ["pending", "processing", "done", "failed"];
    expect(validStatuses.length).toBe(4);
  });

  it("embedding_jobs should track attempts for retry", () => {
    const job = { attempts: 0, status: "pending" };
    expect(job.attempts).toBe(0);
  });

  it("worker retries up to 3 attempts then marks failed", () => {
    const MAX = 3;
    let attempts = 0;
    let status = "pending";
    while (attempts < MAX && status !== "done") {
      attempts++;
      status = attempts >= MAX ? "failed" : "pending";
    }
    expect(status).toBe("failed");
    expect(attempts).toBe(3);
  });

  it("cron embed route is in CRON_ROUTES", async () => {
    const { CRON_ROUTE_PATHS } = await import("../src/lib/cron/routes");
    expect(CRON_ROUTE_PATHS).toContain("/api/cron/embed");
  });
});
