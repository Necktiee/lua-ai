/**
 * AI usage tracking — fire-and-forget persist of token usage per LLM call
 * so the dashboard can show usage over time. Never blocks chat().
 *
 * Phase 9: now tracks estimated cost (USD) per call and optional trace_id
 * for correlating LLM calls with webhook events.
 */
import { supabase } from "@/lib/db/client";
import type { ProviderName } from "./types";

export interface UsageRecord {
  provider: ProviderName;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  elapsedMs: number;
  attempts: number;
  traceId?: string;
}

/** Rough cost per 1M tokens by provider (USD, 2026 estimates). */
const COST_PER_MILLION: Record<string, { input: number; output: number }> = {
  gemini: { input: 0.075, output: 0.30 },
  mistral: { input: 0.15, output: 0.15 },
  openrouter: { input: 0.02, output: 0.02 },
  thaillm: { input: 0.05, output: 0.05 },
};

function estimateCost(provider: string, promptTokens: number, completionTokens: number): number {
  const rates = COST_PER_MILLION[provider] ?? { input: 0.05, output: 0.05 };
  const cost = (promptTokens / 1_000_000) * rates.input + (completionTokens / 1_000_000) * rates.output;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function recordUsage(u: UsageRecord): void {
  if (!supabase) return;
  const costUsd = estimateCost(u.provider, u.promptTokens, u.completionTokens);
  supabase
    .from("llm_usage")
    .insert({
      provider: u.provider,
      model: u.model,
      prompt_tokens: u.promptTokens,
      completion_tokens: u.completionTokens,
      total_tokens: u.totalTokens,
      elapsed_ms: u.elapsedMs,
      attempts: u.attempts,
      cost_usd: costUsd,
      trace_id: u.traceId ?? null,
    })
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) console.warn("[llm] recordUsage failed:", error.message);
    });
}
