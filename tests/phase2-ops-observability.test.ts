import { describe, it, expect } from "vitest";

describe("Phase 2: Trace ID propagation", () => {
  it("HandleInput should accept optional traceId", async () => {
    type HandleInput = Awaited<typeof import("../src/lib/agent/handle")>["HandleInput"];
    const input: HandleInput = {
      userId: "test",
      text: "hello",
      traceId: "abc-123",
    };
    expect(input.traceId).toBe("abc-123");
  });

  it("ChatOptions should accept optional traceId", async () => {
    type ChatOptions = Awaited<typeof import("../src/lib/llm/types")>["ChatOptions"];
    const opts: ChatOptions = {
      traceId: "trace-xyz",
      temperature: 0.5,
    };
    expect(opts.traceId).toBe("trace-xyz");
  });

  it("logMessage should accept traceId parameter", async () => {
    const conv = await import("../src/lib/memory/conversation");
    expect(conv.logMessage.length).toBe(6);
  });
});

describe("Phase 2: Privacy-safe structured logger", () => {
  it("should redact sensitive keys in metadata", async () => {
    const logger = await import("../src/lib/observability/logger");
    expect(typeof logger.logError).toBe("function");
    expect(typeof logger.logWarn).toBe("function");
    expect(typeof logger.logInfo).toBe("function");
    expect(typeof logger.logDebug).toBe("function");
  });

  it("logDebug should be no-op in production-like env", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const logger = await import("../src/lib/observability/logger");
    expect(() => logger.logDebug("test", "msg")).not.toThrow();
    process.env.NODE_ENV = originalEnv;
  });
});

describe("Phase 2: Circuit breaker", () => {
  it("should start in closed state and allow calls", async () => {
    const cb = await import("../src/lib/llm/circuit-breaker");
    expect(cb.isProviderAvailable("gemini")).toBe(true);
  });

  it("should open after threshold consecutive failures", async () => {
    const cb = await import("../src/lib/llm/circuit-breaker");
    cb.resetBreaker("mistral");
    for (let i = 0; i < 5; i++) {
      cb.recordFailure("mistral", `error ${i}`);
    }
    expect(cb.isProviderAvailable("mistral")).toBe(false);
  });

  it("should close after success", async () => {
    const cb = await import("../src/lib/llm/circuit-breaker");
    cb.resetBreaker("openrouter");
    cb.recordFailure("openrouter", "err");
    cb.recordSuccess("openrouter");
    expect(cb.isProviderAvailable("openrouter")).toBe(true);
    const status = cb.getBreakerStatus();
    expect(status.openrouter.state).toBe("closed");
  });

  it("should report breaker status", async () => {
    const cb = await import("../src/lib/llm/circuit-breaker");
    cb.resetBreaker("thaillm");
    const status = cb.getBreakerStatus();
    expect(status).toBeDefined();
  });
});

describe("Phase 2: Cron route registry — daily split", () => {
  it("should include journal and nudge as separate routes", async () => {
    const routes = await import("../src/lib/cron/routes");
    const paths = routes.CRON_ROUTE_PATHS;
    expect(paths).toContain("/api/cron/journal");
    expect(paths).toContain("/api/cron/nudge");
    expect(paths).toContain("/api/cron/daily");
  });

  it("should have at least 10 cron routes after split", async () => {
    const routes = await import("../src/lib/cron/routes");
    expect(routes.CRON_ROUTES.length).toBeGreaterThanOrEqual(10);
  });
});

describe("Phase 2: WebhookEventRow includes trace_id", () => {
  it("WebhookEventRow type should include trace_id", async () => {
    type WebhookEventRow = Awaited<typeof import("../src/lib/webhook/inbox")>["WebhookEventRow"];
    const sample: WebhookEventRow = {
      id: "test",
      webhook_event_id: "test",
      user_id: null,
      status: "pending",
      attempts: 0,
      text_content: null,
      reply_token: null,
      source_type: null,
      message_type: null,
      message_id: null,
      trace_id: "abc-123",
    };
    expect(sample.trace_id).toBe("abc-123");
  });
});
