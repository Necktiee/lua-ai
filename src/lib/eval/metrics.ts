/**
 * Retrieval / ranking metrics for eval harness (offline-friendly).
 */

/** Recall@K: fraction of relevant IDs appearing in top-K retrieved. */
export function recallAtK(retrieved: string[], relevant: string[], k: number): number {
  if (relevant.length === 0) return 1;
  const top = new Set(retrieved.slice(0, k));
  let hit = 0;
  for (const id of relevant) if (top.has(id)) hit++;
  return hit / relevant.length;
}

/** Precision@K: fraction of top-K that are relevant. */
export function precisionAtK(retrieved: string[], relevant: string[], k: number): number {
  const top = retrieved.slice(0, k);
  if (top.length === 0) return 0;
  const rel = new Set(relevant);
  let hit = 0;
  for (const id of top) if (rel.has(id)) hit++;
  return hit / top.length;
}

function dcg(relevances: number[]): number {
  let s = 0;
  for (let i = 0; i < relevances.length; i++) {
    s += relevances[i]! / Math.log2(i + 2);
  }
  return s;
}

/** nDCG@K with binary relevance. */
export function ndcgAtK(retrieved: string[], relevant: string[], k: number): number {
  const rel = new Set(relevant);
  const top = retrieved.slice(0, k);
  const gains = top.map((id) => (rel.has(id) ? 1 : 0));
  // Ideal: min(k, |relevant|) ones at the front
  const idealGains = Array.from({ length: Math.min(k, relevant.length) }, () => 1).concat(
    Array.from({ length: Math.max(0, k - relevant.length) }, () => 0),
  );
  const idcg = dcg(idealGains.slice(0, k));
  if (idcg === 0) return 1;
  return dcg(gains) / idcg;
}

export interface MetricSummary {
  recallAt10: number;
  precisionAt5: number;
  ndcgAt5: number;
  cases: number;
}

export function averageMetrics(
  cases: Array<{ retrieved: string[]; relevant: string[] }>,
): MetricSummary {
  if (cases.length === 0) {
    return { recallAt10: 0, precisionAt5: 0, ndcgAt5: 0, cases: 0 };
  }
  let r = 0;
  let p = 0;
  let n = 0;
  for (const c of cases) {
    r += recallAtK(c.retrieved, c.relevant, 10);
    p += precisionAtK(c.retrieved, c.relevant, 5);
    n += ndcgAtK(c.retrieved, c.relevant, 5);
  }
  return {
    recallAt10: r / cases.length,
    precisionAt5: p / cases.length,
    ndcgAt5: n / cases.length,
    cases: cases.length,
  };
}
