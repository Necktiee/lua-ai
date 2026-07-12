/**
 * Admin operator dashboard — queue health, dead-letter management, provider status.
 * Protected by CRON_SECRET (same as cron auth) — fail-closed in production.
 *
 * GET /api/admin/ops         — queue depth, dead letters, provider breaker status, recent costs
 * POST /api/admin/ops/retry  — reset a dead-lettered webhook event back to pending
 */
import { requireDb } from "@/lib/db/client";
import { authorizeCron } from "@/lib/cron/auth";
import { getBreakerStatus } from "@/lib/llm/circuit-breaker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const db = requireDb();
  const results: Record<string, unknown> = {};

  // Webhook event queue depth by status
  const { data: webhookStatuses } = await db
    .from("webhook_events")
    .select("status")
    .order("created_at", { ascending: false })
    .limit(500);

  const webhookCounts: Record<string, number> = {};
  for (const row of webhookStatuses ?? []) {
    const s = (row as { status: string }).status;
    webhookCounts[s] = (webhookCounts[s] ?? 0) + 1;
  }
  results.webhookQueue = webhookCounts;

  // Dead-lettered events (most recent 20)
  const { data: deadLetters } = await db
    .from("webhook_events")
    .select("webhook_event_id, user_id, text_content, attempts, error, created_at, trace_id")
    .eq("status", "dead_letter")
    .order("created_at", { ascending: false })
    .limit(20);
  results.deadLetters = deadLetters ?? [];

  // Embedding job queue
  const { data: embedStatuses } = await db
    .from("embedding_jobs")
    .select("status")
    .order("created_at", { ascending: false })
    .limit(500);

  const embedCounts: Record<string, number> = {};
  for (const row of embedStatuses ?? []) {
    const s = (row as { status: string }).status;
    embedCounts[s] = (embedCounts[s] ?? 0) + 1;
  }
  results.embeddingQueue = embedCounts;

  // Provider circuit breaker status
  results.circuitBreakers = getBreakerStatus();

  // Recent LLM costs (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: costData } = await db
    .from("llm_usage")
    .select("provider, model, cost_usd, total_tokens, created_at")
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(200);

  const totalCost = (costData ?? []).reduce(
    (sum: number, row) => sum + ((row as { cost_usd?: number }).cost_usd ?? 0),
    0,
  );
  results.llmCost7d = {
    totalUsd: Math.round(totalCost * 1_000_000) / 1_000_000,
    calls: costData?.length ?? 0,
  };

  return Response.json(results);
}

export async function POST(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  let body: { action?: string; webhookEventId?: string; provider?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  if (body.action === "retry" && body.webhookEventId) {
    const db = requireDb();
    const { data, error } = await db
      .from("webhook_events")
      .update({ status: "pending", attempts: 0, error: null, next_retry_at: null, claimed_at: null })
      .eq("webhook_event_id", body.webhookEventId)
      .in("status", ["dead_letter", "failed"])
      .select("webhook_event_id, status")
      .maybeSingle();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) return Response.json({ error: "event not found or not in dead_letter/failed state" }, { status: 404 });
    return Response.json({ ok: true, event: data });
  }

  if (body.action === "reset_breaker" && body.provider) {
    const { resetBreaker } = await import("@/lib/llm/circuit-breaker");
    resetBreaker(body.provider as "gemini" | "mistral" | "thaillm" | "openrouter");
    return Response.json({ ok: true, provider: body.provider });
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
}
