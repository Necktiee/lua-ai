/**
 * Offline eval runners — used by vitest + scripts/eval-*.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validAction, type Action } from "@/lib/intent/router";
import { averageMetrics, type MetricSummary } from "@/lib/eval/metrics";
import { PROMPT_VERSION, SOP_VERSION, T0_SECURITY_POLICY, T1_PRODUCT_SOP } from "@/lib/agent/context";

const ROOT = process.cwd();

function loadJson<T>(rel: string): T {
  const path = join(ROOT, rel);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export interface RoutingCase {
  id: string;
  text: string;
  expect: string;
}

export interface RetrievalCase {
  id: string;
  query: string;
  relevant: string[];
  retrieved: string[];
}

export interface PromptReplaySpec {
  prompt_version: string;
  sop_version: string;
  required_t0_phrases: string[];
  required_t1_phrases: string[];
}

export function loadRoutingCorpus(): RoutingCase[] {
  return loadJson<RoutingCase[]>("evals/routing.json");
}

export function loadRetrievalCorpus(): RetrievalCase[] {
  return loadJson<RetrievalCase[]>("evals/retrieval.json");
}

export function loadPromptReplaySpec(): PromptReplaySpec {
  return loadJson<PromptReplaySpec>("evals/prompt-replay.json");
}

/** Schema gate: every fixture maps to a known Action. */
export function validateRoutingCorpus(cases = loadRoutingCorpus()): {
  ok: boolean;
  invalid: string[];
  count: number;
} {
  const invalid: string[] = [];
  for (const c of cases) {
    if (!validAction(c.expect)) invalid.push(`${c.id}:${c.expect}`);
  }
  return { ok: invalid.length === 0, invalid, count: cases.length };
}

export function scoreRetrievalCorpus(
  cases = loadRetrievalCorpus(),
): MetricSummary {
  return averageMetrics(
    cases.map((c) => ({ retrieved: c.retrieved, relevant: c.relevant })),
  );
}

export interface PromptReplayResult {
  ok: boolean;
  promptVersionMatch: boolean;
  sopVersionMatch: boolean;
  missingT0: string[];
  missingT1: string[];
}

export function runPromptReplay(spec = loadPromptReplaySpec()): PromptReplayResult {
  const missingT0 = spec.required_t0_phrases.filter((p) => !T0_SECURITY_POLICY.includes(p));
  const missingT1 = spec.required_t1_phrases.filter((p) => !T1_PRODUCT_SOP.includes(p));
  const promptVersionMatch = PROMPT_VERSION === spec.prompt_version;
  const sopVersionMatch = SOP_VERSION === spec.sop_version;
  return {
    ok:
      promptVersionMatch &&
      sopVersionMatch &&
      missingT0.length === 0 &&
      missingT1.length === 0,
    promptVersionMatch,
    sopVersionMatch,
    missingT0,
    missingT1,
  };
}

/** Gates from roadmap DoD (soft targets for fixture corpus). */
export const RETRIEVAL_GATES = {
  recallAt10: 0.9,
  precisionAt5: 0.85,
  ndcgAt5: 0.85,
} as const;

export type { Action };
