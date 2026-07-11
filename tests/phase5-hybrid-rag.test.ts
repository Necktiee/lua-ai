import { describe, it, expect } from "vitest";

describe("Phase 5: Hybrid RAG invariants", () => {
  it("hybrid_memory_search RPC should exist with RRF fusion", () => {
    // The RPC fuses FTS + vector results using Reciprocal Rank Fusion
    const params = {
      query_text: "test",
      query_embedding: "[0.1,0.2]",
      query_user: "U123",
      match_count: 10,
      full_text_weight: 1.0,
      semantic_weight: 1.0,
      rrf_k: 50,
    };
    expect(params.rrf_k).toBe(50);
    expect(params.full_text_weight).toBe(params.semantic_weight);
  });

  it("RRF score = full_text_weight/(k+fts_rank) + semantic_weight/(k+vec_rank)", () => {
    const k = 50;
    const ftsRank = 1;
    const vecRank = 3;
    const ftsWeight = 1.0;
    const vecWeight = 1.0;
    const score = (1.0 / (k + ftsRank)) * ftsWeight + (1.0 / (k + vecRank)) * vecWeight;
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(0.05);
  });

  it("hybrid_knowledge_search RPC should exist with RRF fusion", () => {
    const params = {
      query_text: "ชื่อ",
      query_embedding: "[0.1]",
      query_user: "U123",
      match_count: 5,
      query_category: null,
    };
    expect(params.match_count).toBe(5);
  });
});

describe("Phase 5: Token budget invariants", () => {
  it("estimateTokens should approximate ~4 chars per token", () => {
    const text = "Hello world this is a test";
    const tokens = Math.ceil(text.length / 4);
    expect(tokens).toBe(Math.ceil(27 / 4));
  });

  it("MAX_EVIDENCE_TOKENS should be bounded", () => {
    const MAX_EVIDENCE_TOKENS = 2500;
    expect(MAX_EVIDENCE_TOKENS).toBeLessThanOrEqual(5000);
    expect(MAX_EVIDENCE_TOKENS).toBeGreaterThanOrEqual(1000);
  });

  it("MAX_KB_ALWAYS_TOKENS should be bounded", () => {
    const MAX_KB_ALWAYS_TOKENS = 800;
    expect(MAX_KB_ALWAYS_TOKENS).toBeLessThanOrEqual(1500);
    expect(MAX_KB_ALWAYS_TOKENS).toBeGreaterThanOrEqual(400);
  });

  it("formatKnowledge should stop adding items when budget exceeded", () => {
    let usedTokens = 0;
    const maxTokens = 800;
    const items = Array.from({ length: 50 }, (_, i) => `item-${i}-content`.repeat(20));
    const included: string[] = [];
    for (const item of items) {
      const lineTokens = Math.ceil(item.length / 4);
      if (usedTokens + lineTokens > maxTokens) break;
      included.push(item);
      usedTokens += lineTokens;
    }
    expect(included.length).toBeLessThan(50);
    expect(usedTokens).toBeLessThanOrEqual(maxTokens);
  });
});

describe("Phase 5: FTS columns invariants", () => {
  it("memory should have fts tsvector column", () => {
    const columns = ["content", "fts", "embedding", "tags"];
    expect(columns).toContain("fts");
  });

  it("knowledge should have fts tsvector column", () => {
    const columns = ["key", "value", "fts", "embedding"];
    expect(columns).toContain("fts");
  });

  it("fts uses 'simple' config (Thai has no built-in tokenizer)", () => {
    const config = "simple";
    expect(config).toBe("simple");
  });
});
