import { describe, it, expect } from "vitest";
import {
  validateRoutingCorpus,
  scoreRetrievalCorpus,
  runPromptReplay,
  RETRIEVAL_GATES,
  loadRoutingCorpus,
} from "@/lib/eval/run";
import { recallAtK, precisionAtK, ndcgAtK } from "@/lib/eval/metrics";

describe("Eval harness: metrics", () => {
  it("recallAtK counts relevant hits in top-K", () => {
    expect(recallAtK(["a", "b", "c"], ["a", "c"], 2)).toBe(0.5);
    expect(recallAtK(["a", "b", "c"], ["a", "c"], 3)).toBe(1);
  });

  it("precisionAtK counts relevant fraction of top-K", () => {
    expect(precisionAtK(["a", "x", "b"], ["a", "b"], 2)).toBe(0.5);
    expect(precisionAtK(["a", "b", "x"], ["a", "b"], 2)).toBe(1);
  });

  it("ndcgAtK is 1 for perfect ranking", () => {
    expect(ndcgAtK(["a", "b", "c"], ["a", "b"], 2)).toBeCloseTo(1, 5);
  });
});

describe("Eval harness: routing corpus", () => {
  it("every fixture expect is a valid Action", () => {
    const result = validateRoutingCorpus();
    expect(result.invalid).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.count).toBeGreaterThanOrEqual(35);
  });

  it("includes remember override case จด: expense", () => {
    const cases = loadRoutingCorpus();
    const c = cases.find((x) => x.id === "r40");
    expect(c?.expect).toBe("remember");
  });
});

describe("Eval harness: retrieval corpus gates", () => {
  it("fixture corpus meets Recall@10 / Precision@5 / nDCG@5 soft gates", () => {
    const m = scoreRetrievalCorpus();
    expect(m.cases).toBeGreaterThanOrEqual(5);
    expect(m.recallAt10).toBeGreaterThanOrEqual(RETRIEVAL_GATES.recallAt10);
    expect(m.precisionAt5).toBeGreaterThanOrEqual(RETRIEVAL_GATES.precisionAt5);
    expect(m.ndcgAt5).toBeGreaterThanOrEqual(RETRIEVAL_GATES.ndcgAt5);
  });
});

describe("Eval harness: prompt replay", () => {
  it("T0/T1 versions and required phrases match evals/prompt-replay.json", () => {
    const result = runPromptReplay();
    expect(result.missingT0).toEqual([]);
    expect(result.missingT1).toEqual([]);
    expect(result.promptVersionMatch).toBe(true);
    expect(result.sopVersionMatch).toBe(true);
    expect(result.ok).toBe(true);
  });
});
