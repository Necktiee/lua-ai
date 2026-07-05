/**
 * AI usage tracking (goal.* Phase 4) — fire-and-forget persist of token usage
 * per LLM call so the dashboard can show usage over time. Never blocks chat().
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
}

export function recordUsage(u: UsageRecord): void {
  if (!supabase) return;
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
    })
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) console.warn("[llm] recordUsage failed:", error.message);
    });
}
