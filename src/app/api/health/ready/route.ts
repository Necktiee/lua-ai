import { supabase } from "@/lib/db/client";
import { env, hasSupabase } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

interface Check {
  name: string;
  ok: boolean;
  latencyMs?: number;
  detail?: string;
}

/**
 * Readiness probe — checks actual dependency connectivity, not just config.
 * Returns 200 when all critical checks pass, 503 when any fail.
 */
export async function GET() {
  const checks: Check[] = [];
  const start = Date.now();

  // DB connectivity
  if (!hasSupabase()) {
    checks.push({ name: "database", ok: false, detail: "not configured" });
  } else {
    try {
      const t0 = Date.now();
      const { error } = await supabase!
        .from("users")
        .select("line_user_id")
        .limit(1)
        .maybeSingle();
      const latency = Date.now() - t0;
      checks.push({
        name: "database",
        ok: !error,
        latencyMs: latency,
        detail: error ? error.message : undefined,
      });
    } catch (e) {
      checks.push({ name: "database", ok: false, detail: (e as Error).message });
    }
  }

  // LLM provider key presence
  const hasLlmKey = !!(
    env.GEMINI_API_KEYS ||
    env.MISTRAL_API_KEYS ||
    env.OPENROUTER_API_KEYS ||
    env.THAILLM_API_KEYS
  );
  checks.push({ name: "llm_keys", ok: hasLlmKey });

  const allOk = checks.every((c) => c.ok);
  const totalLatency = Date.now() - start;

  return Response.json(
    {
      ok: allOk,
      service: "lua-ai",
      checks,
      totalLatencyMs: totalLatency,
      now: new Date().toISOString(),
    },
    {
      status: allOk ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
