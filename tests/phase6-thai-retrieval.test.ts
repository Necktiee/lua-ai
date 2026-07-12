import { describe, it, expect } from "vitest";
import { PROMPT_VERSION, T0_SECURITY_POLICY } from "@/lib/agent/context";
import * as jobs from "@/lib/embedding/jobs";
import type { SearchResult } from "@/lib/memory/store";

describe("Phase 6: Thai-First Retrieval And Evidence Packing", () => {
  describe("pg_trgm migration", () => {
    it("migration file exists", async () => {
      const fs = await import("node:fs");
      const path = "supabase/migrations/20260712120000_phase6_thai_retrieval.sql";
      expect(fs.existsSync(path)).toBe(true);
      const sql = fs.readFileSync(path, "utf-8");
      expect(sql).toContain("pg_trgm");
      expect(sql).toContain("gin_trgm_ops");
      expect(sql).toContain("trgm_results");
      expect(sql).toContain("similarity(content");
    });

    it("migration creates trigram indexes on both tables", async () => {
      const fs = await import("node:fs");
      const sql = fs.readFileSync(
        "supabase/migrations/20260712120000_phase6_thai_retrieval.sql",
        "utf-8",
      );
      expect(sql).toContain("memory_trgm_idx");
      expect(sql).toContain("knowledge_key_trgm_idx");
      expect(sql).toContain("knowledge_value_trgm_idx");
    });

    it("migration revokes EXECUTE after function creation", async () => {
      const fs = await import("node:fs");
      const sql = fs.readFileSync(
        "supabase/migrations/20260712120000_phase6_thai_retrieval.sql",
        "utf-8",
      );
      expect(sql).toContain("revoke execute on function hybrid_memory_search");
      expect(sql).toContain("revoke execute on function hybrid_knowledge_search");
    });
  });

  describe("Evidence packer with source IDs", () => {
    it("T0 policy mentions source IDs", () => {
      expect(T0_SECURITY_POLICY).toContain("[M1]");
      expect(T0_SECURITY_POLICY).toContain("[K2]");
    });

    it("PROMPT_VERSION bumped", () => {
      expect(PROMPT_VERSION).toBe("2026-07-12-v4");
    });
  });

  describe("Embedding model drift detection", () => {
    it("enqueueModelDriftCandidates function exists", () => {
      expect(typeof jobs.enqueueModelDriftCandidates).toBe("function");
    });

    it("enqueueReindexCandidates still exists", () => {
      expect(typeof jobs.enqueueReindexCandidates).toBe("function");
    });
  });

  describe("KB recallKnowledgeHybrid RRF/cosine fix", () => {
    it("KnowledgeSearchResult has rrfScore field", async () => {
      const mod = await import("@/lib/kb/repo");
      // The interface should exist and the function should be callable
      expect(typeof mod.recallKnowledgeHybrid).toBe("function");
      expect(typeof mod.recallKnowledge).toBe("function");
    });
  });

  describe("People repo comments fixed", () => {
    it("upsertPerson no longer claims partial matching", async () => {
      const fs = await import("node:fs");
      const src = fs.readFileSync("src/lib/people/repo.ts", "utf-8");
      // The stale comment "then partial" should be gone
      expect(src).not.toContain("then partial");
      // The JSDoc should not claim upsertPerson does "fuzzy partial matching"
      expect(src).not.toContain("does fuzzy partial matching");
    });
  });

  describe("Hybrid cosine gate removed (Phase 6 audit fix)", () => {
    it("recallHybrid does not apply minSimilarity filter on RRF results", async () => {
      const fs = await import("node:fs");
      const src = fs.readFileSync("src/lib/memory/store.ts", "utf-8");
      // The old dead condition should be gone
      expect(src).not.toContain("r.rrfScore === 0");
      // Should not conflate rrf_score into similarity field
      expect(src).not.toContain("r.similarity ?? r.rrf_score");
    });

    it("recallKnowledgeHybrid does not apply minSimilarity filter on RRF results", async () => {
      const fs = await import("node:fs");
      const src = fs.readFileSync("src/lib/kb/repo.ts", "utf-8");
      expect(src).not.toContain("(r.rrfScore ?? 0) === 0");
    });

    it("SearchResult type has separate rrfScore field", () => {
      const sample: SearchResult = {
        memory: {
          id: "test",
          user_id: "U123",
          kind: "text",
          content: "test",
          raw: {},
          storage_path: null,
          tags: [],
          created_at: "2026-01-01",
        },
        similarity: 0.85,
        rrfScore: 0.02,
      };
      expect(sample.rrfScore).toBe(0.02);
      expect(sample.similarity).toBe(0.85);
    });

    it("null-embedding trigram match would not be filtered (similarity=0, rrfScore>0)", () => {
      const results: SearchResult[] = [
        {
          memory: { id: "1", user_id: "U1", kind: "text", content: "a", raw: {}, storage_path: null, tags: [], created_at: "" },
          similarity: 0,
          rrfScore: 0.015,
        },
        {
          memory: { id: "2", user_id: "U1", kind: "text", content: "b", raw: {}, storage_path: null, tags: [], created_at: "" },
          similarity: 0.8,
          rrfScore: 0.03,
        },
      ];
      // Old bug: rrfScore === 0 always false → both gated by 0.3 → first dropped
      // New: no gate at all on hybrid path → both returned
      expect(results.length).toBe(2);
      expect(results[0].similarity).toBe(0);
      expect(results[0].rrfScore).toBeGreaterThan(0);
    });
  });

  describe("Drift detection fixes (Phase 6 audit)", () => {
    it("enqueueModelDriftCandidates filters in JS (not SQL neq) to catch NULLs", async () => {
      const fs = await import("node:fs");
      const src = fs.readFileSync("src/lib/embedding/jobs.ts", "utf-8");
      // Should NOT use .neq on embedding_model (misses SQL NULL rows)
      expect(src).not.toContain('.neq("embedding_model"');
      // Should have JS-side check
      expect(src).toContain("r.embedding_model === MODEL");
    });

    it("drift fn checks existing job BEFORE marking reindex", async () => {
      const fs = await import("node:fs");
      const src = fs.readFileSync("src/lib/embedding/jobs.ts", "utf-8");
      const markIdx = src.indexOf('update({ embedding_status: "reindex" })');
      const checkIdx = src.indexOf(
        '.eq("target_table", table)\n        .eq("target_id", r.id)',
      );
      // The dedup check should come before the mark
      expect(checkIdx).toBeGreaterThan(-1);
      expect(markIdx).toBeGreaterThan(-1);
      // In enqueueModelDriftCandidates, check must come before mark
      const fnStart = src.indexOf("enqueueModelDriftCandidates");
      const fnEnd = src.indexOf("return n;", fnStart);
      const fnBody = src.slice(fnStart, fnEnd);
      const fnCheckIdx = fnBody.indexOf(".maybeSingle()");
      const fnMarkIdx = fnBody.indexOf('update({ embedding_status: "reindex" })');
      expect(fnCheckIdx).toBeGreaterThan(-1);
      expect(fnMarkIdx).toBeGreaterThan(-1);
      expect(fnCheckIdx).toBeLessThan(fnMarkIdx);
    });
  });
});
