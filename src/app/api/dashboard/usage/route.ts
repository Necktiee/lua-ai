/**
 * Dashboard: AI usage stats (goal.* Phase 4) — recent llm_usage rows + rollup
 * totals by provider, so the dashboard can show token/cost usage over time.
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import { requireDb } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UsageRow {
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  elapsed_ms: number;
  attempts: number;
  created_at: string;
}

export async function GET() {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  try {
    const db = requireDb();
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await db
      .from("llm_usage")
      .select("provider, model, prompt_tokens, completion_tokens, total_tokens, elapsed_ms, attempts, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;

    const rows = (data ?? []) as UsageRow[];
    const byProvider: Record<string, { calls: number; totalTokens: number; avgElapsedMs: number }> = {};
    for (const r of rows) {
      const b = byProvider[r.provider] ?? { calls: 0, totalTokens: 0, avgElapsedMs: 0 };
      b.calls += 1;
      b.totalTokens += r.total_tokens;
      b.avgElapsedMs += r.elapsed_ms;
      byProvider[r.provider] = b;
    }
    for (const key of Object.keys(byProvider)) {
      byProvider[key].avgElapsedMs = Math.round(byProvider[key].avgElapsedMs / byProvider[key].calls);
    }

    const totalCalls = rows.length;
    const totalTokens = rows.reduce((s, r) => s + r.total_tokens, 0);

    return Response.json({
      summary: { totalCalls, totalTokens, byProvider },
      recent: rows.slice(0, 20),
    });
  } catch (e) {
    return Response.json({ summary: { totalCalls: 0, totalTokens: 0, byProvider: {} }, recent: [], error: (e as Error).message });
  }
}
