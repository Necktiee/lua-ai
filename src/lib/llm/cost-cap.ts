/**
 * Soft daily cost caps from llm_usage.cost_usd.
 * Soft: warn. Hard: block further chat() in-process for the day (best-effort).
 */
import { requireDb } from "@/lib/db/client";
import { localDayBounds, BANGKOK } from "@/lib/tz";

/** Soft USD/day — log warning when exceeded */
export const COST_SOFT_CAP_USD = 5;
/** Hard USD/day — refuse new LLM calls when exceeded */
export const COST_HARD_CAP_USD = 15;

let cached: { day: string; total: number; at: number } | null = null;

export async function todayCostUsd(timeZone = BANGKOK): Promise<number> {
  const { start, end } = localDayBounds(new Date(), timeZone);
  const day = start.slice(0, 10);
  if (cached && cached.day === day && Date.now() - cached.at < 60_000) {
    return cached.total;
  }
  const db = requireDb();
  const { data, error } = await db
    .from("llm_usage")
    .select("cost_usd")
    .gte("created_at", start)
    .lt("created_at", end);
  if (error) {
    console.warn("[cost-cap] query", error.message);
    return 0;
  }
  const total = (data ?? []).reduce(
    (s, r) => s + (Number((r as { cost_usd?: number }).cost_usd) || 0),
    0,
  );
  cached = { day, total, at: Date.now() };
  return total;
}

export async function assertUnderCostCap(): Promise<{ ok: boolean; total: number; soft: boolean }> {
  const total = await todayCostUsd();
  if (total >= COST_HARD_CAP_USD) {
    return { ok: false, total, soft: false };
  }
  if (total >= COST_SOFT_CAP_USD) {
    console.warn(`[cost-cap] soft cap exceeded: $${total.toFixed(4)} >= $${COST_SOFT_CAP_USD}`);
    return { ok: true, total, soft: true };
  }
  return { ok: true, total, soft: false };
}

/** Test helper */
export function _resetCostCache() {
  cached = null;
}
