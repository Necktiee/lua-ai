/**
 * P0 regression fixture: zero-row RAG fallback.
 *
 * The audit found that `recall()` and `recallKnowledge()` only invoke
 * text fallback when `results.length > 0` but filtered.length === 0.
 * When the vector RPC returns zero rows (e.g. null embeddings), the
 * text fallback never runs, making those memories undiscoverable.
 *
 * This fixture provides the exact condition to test:
 * - RPC returns [] (not filtered to empty, but genuinely empty)
 * - Exact text match exists in DB
 * - Text fallback MUST still run
 */

export const RAG_FALLBACK_SCENARIOS = [
  {
    name: "memory: null embedding, exact text match exists",
    query: "งบโครงการ 100,000 บาท",
    storedContent: "งบโครงการ 100,000 บาท ต้องเสนอภายในสิ้นเดือน",
    embedding: null,
    expectedFallback: true,
    expectedSimilarity: 0.4,
  },
  {
    name: "kb: null embedding, exact key match exists",
    query: "ชื่อจริง",
    storedKey: "ชื่อจริง",
    storedValue: "สมชาย ใจดี",
    embedding: null,
    expectedFallback: true,
    expectedSimilarity: 0.4,
  },
  {
    name: "memory: valid embedding, low similarity, no text match",
    query: "อะไรที่ไม่เกี่ยวเลย",
    storedContent: "งบโครงการ 100,000 บาท",
    embedding: [0.1, 0.2, 0.3],
    expectedFallback: false,
    expectedSimilarity: 0,
  },
] as const;
