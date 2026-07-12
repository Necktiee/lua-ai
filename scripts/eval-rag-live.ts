/**
 * Live hybrid-RAG evaluation against Supabase + the configured embedding provider.
 * Creates an isolated, disposable user and removes all rows in finally.
 *
 * Usage: npx tsx scripts/eval-rag-live.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import type { SupabaseClient } from "@supabase/supabase-js";

const EVAL_USER_ID = "__system_live_rag_eval__";

const CASES = [
  {
    id: "travel",
    query: "เอกสารพาสปอร์ตสำหรับทริปโอซาก้า",
    anchor: "RAG_EVAL_TRAVEL_OSAKA_PASSPORT",
  },
  {
    id: "finance",
    query: "งบประมาณไตรมาสสองสำหรับโครงการออโรรา",
    anchor: "RAG_EVAL_FINANCE_AURORA_Q2",
  },
  {
    id: "health",
    query: "นัดตรวจหัวใจกับคุณหมอวัฒนา",
    anchor: "RAG_EVAL_HEALTH_WATTANA_CARDIOLOGY",
  },
] as const;

async function cleanup(db: SupabaseClient) {
  await db.from("embedding_jobs").delete().eq("user_id", EVAL_USER_ID);
  await db.from("memory").delete().eq("user_id", EVAL_USER_ID);
  await db.from("users").delete().eq("line_user_id", EVAL_USER_ID);
}

async function main() {
  const hasEmbeddingKey = [
    process.env.OPENROUTER_API_KEYS,
    process.env.GEMINI_API_KEYS,
    process.env.MISTRAL_API_KEYS,
  ].some((value) => Boolean(value?.trim()));
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !hasEmbeddingKey) {
    throw new Error("Live RAG eval requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and an embedding-provider API key");
  }

  const [{ requireDb }, { recallHybrid, remember }, { averageMetrics }, { RETRIEVAL_GATES }] =
    await Promise.all([
      import("../src/lib/db/client"),
      import("../src/lib/memory/store"),
      import("../src/lib/eval/metrics"),
      import("../src/lib/eval/run"),
    ]);
  const db = requireDb();
  await cleanup(db);
  try {
    const expected = new Map<string, string[]>();
    for (const c of CASES) {
      const ids: string[] = [];
      for (let i = 1; i <= 5; i++) {
        const memory = await remember({
          userId: EVAL_USER_ID,
          kind: "text",
          tags: ["live-rag-eval", c.id],
          content: `${c.anchor} หลักฐานชุดที่ ${i}: ข้อมูลทดสอบ retrieval สำหรับ ${c.query}`,
          sourceType: "system_eval",
          sourceId: `${c.id}-${i}`,
        });
        ids.push(memory.id);
      }
      expected.set(c.id, ids);
    }

    const scored: Array<{ retrieved: string[]; relevant: string[] }> = [];
    for (const c of CASES) {
      const results = await recallHybrid(EVAL_USER_ID, c.query, 10, { tag: "live-rag-eval" });
      const retrieved = results.map((result) => result.memory.id);
      const relevant = expected.get(c.id) ?? [];
      const hits = retrieved.filter((id) => relevant.includes(id)).length;
      console.log(`${c.id}: ${hits}/${relevant.length} relevant in top 10`);
      scored.push({ retrieved, relevant });
    }

    const metrics = averageMetrics(scored);
    console.log("Live RAG metrics:", JSON.stringify(metrics, null, 2));
    const passes =
      metrics.recallAt10 >= RETRIEVAL_GATES.recallAt10 &&
      metrics.precisionAt5 >= RETRIEVAL_GATES.precisionAt5 &&
      metrics.ndcgAt5 >= RETRIEVAL_GATES.ndcgAt5;
    if (!passes) {
      throw new Error(
        `Live RAG gate failed: Recall@10 >= ${RETRIEVAL_GATES.recallAt10}, ` +
          `Precision@5 >= ${RETRIEVAL_GATES.precisionAt5}, nDCG@5 >= ${RETRIEVAL_GATES.ndcgAt5}`,
      );
    }
  } finally {
    await cleanup(db);
  }
}

main().catch((error) => {
  console.error("LIVE RAG EVAL FAILED", error);
  process.exit(1);
});
