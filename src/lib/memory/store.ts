/**
 * Memory store — บันทึกและค้น semantic ผ่าน pgvector.
 */
import { requireDb, touchUser } from "@/lib/db/client";
import { embedOne } from "@/lib/llm/embed";
import type { MemoryRecord } from "@/lib/types";

export async function remember(args: {
  userId: string;
  kind: MemoryRecord["kind"];
  content: string;
  raw?: Record<string, unknown>;
  storagePath?: string;
  tags?: string[];
}): Promise<MemoryRecord> {
  const db = requireDb();
  await touchUser(args.userId);
  let embedding: number[] | null = null;
  try {
    embedding = await embedOne(args.content.slice(0, 8000));
  } catch (err) {
    console.warn("[memory] embed failed:", (err as Error).message);
  }

  const row = {
    user_id: args.userId,
    kind: args.kind,
    content: args.content,
    raw: args.raw ?? null,
    storage_path: args.storagePath ?? null,
    embedding: embedding ?? null,
    tags: args.tags ?? [],
  };

  const { data, error } = await db
    .from("memory")
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(`memory insert: ${error.message}`);
  return data as MemoryRecord;
}

export interface RecallFilters {
  /** Filter by tag (e.g. "decision", "expense") */
  tag?: string;
  /** ISO date lower bound (inclusive) */
  startDate?: string;
  /** ISO date upper bound (exclusive) */
  endDate?: string;
  /**
   * Minimum cosine similarity to accept a match (0-1). pgvector always
   * returns *something* close to top-K even when nothing is truly relevant
   * to a novel query — without a floor, recall() can confidently return
   * unrelated memories as if they were real answers. Default 0.3 matches
   * the threshold already used ad hoc by people/query.ts, meeting/prep.ts,
   * and travel/checklist.ts; centralizing here means every caller gets the
   * same quality gate instead of only the ones that remembered to add it.
   */
  minSimilarity?: number;
}

export interface SearchResult {
  memory: MemoryRecord;
  similarity: number;
}

const DEFAULT_MIN_SIMILARITY = 0.3;

export async function recall(
  userId: string,
  query: string,
  limit = 5,
  filters?: RecallFilters,
  /**
   * Optional pre-computed query embedding. Lets a caller that already embedded
   * this exact query (e.g. buildAgentContext, which runs recall + recallKnowledge
   * on the same message) reuse one embedding instead of paying for two. When
   * omitted, recall() embeds the query itself as before.
   */
  precomputedVec?: number[],
): Promise<SearchResult[]> {
  const db = requireDb();

  let vec: number[];
  if (precomputedVec) {
    vec = precomputedVec;
  } else {
    try {
      vec = await embedOne(query.slice(0, 8000));
    } catch (err) {
      console.warn("[memory] embed failed, using ILIKE fallback:", (err as Error).message);
      return recallTextFallback(db, userId, query, limit, filters);
    }
  }

  // pgvector ต้องการ string format "[0.1,0.2,...]"
  const vecStr = `[${vec.join(",")}]`;

  // Tag/date filters are applied inside the SQL RPC (see
  // match_memory_filters migration) so ranking + limit only ever consider
  // rows that already satisfy the filters — avoids undercounting real
  // matches that would otherwise be ranked outside the unfiltered top-N.
  const { data, error } = await db.rpc("match_memory", {
    query_embedding: vecStr,
    query_user: userId,
    match_count: limit,
    query_tag: filters?.tag ?? null,
    query_start: filters?.startDate ?? null,
    query_end: filters?.endDate ?? null,
  });
  if (error) {
    return recallTextFallback(db, userId, query, limit, filters);
  }
  const results: SearchResult[] = (data ?? []).map((r: { id: string; content: string; kind: string; raw: unknown; storage_path: string | null; created_at: string; similarity: number | string; tags?: string[] }) => ({
    memory: {
      id: r.id,
      kind: r.kind as MemoryRecord["kind"],
      user_id: userId,
      content: r.content,
      raw: r.raw as Record<string, unknown>,
      storage_path: r.storage_path,
      tags: r.tags ?? [],
      created_at: r.created_at,
    } as MemoryRecord,
    similarity: Number(r.similarity),
  }));

  const minSim = filters?.minSimilarity ?? DEFAULT_MIN_SIMILARITY;
  const filtered = results.filter((r) => r.similarity >= minSim);

  // If the filters (tag/date/similarity) emptied the vector hits entirely,
  // fall back to SQL-filtered text search rather than confidently returning
  // "nothing found" when a plain ILIKE match might still exist.
  if (filtered.length === 0 && results.length > 0) {
    return recallTextFallback(db, userId, query, limit, filters);
  }
  return filtered;
}

async function recallTextFallback(
  db: ReturnType<typeof requireDb>,
  userId: string,
  query: string,
  limit: number,
  filters?: RecallFilters,
): Promise<SearchResult[]> {
  const escaped = escapeIlike(query);
  let fbQuery = db
    .from("memory")
    .select("*")
    .eq("user_id", userId)
    .ilike("content", `%${escaped}%`);
  if (filters?.tag) fbQuery = fbQuery.contains("tags", [filters.tag]);
  if (filters?.startDate) fbQuery = fbQuery.gte("created_at", filters.startDate);
  if (filters?.endDate) fbQuery = fbQuery.lt("created_at", filters.endDate);
  const { data: fallback, error: fbErr } = await fbQuery
    .order("created_at", { ascending: false })
    .limit(limit);
  if (fbErr) console.warn("[memory] recall fallback", fbErr.message);
  return (fallback ?? []).map((m) => ({
    memory: m as MemoryRecord,
    similarity: 0.4,
  }));
}

/** Escape `%`, `_`, and `\` for Postgres ILIKE patterns (parameterized value). */
function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}

export async function listRecent(userId: string, limit = 10): Promise<MemoryRecord[]> {
  const db = requireDb();
  const { data } = await db
    .from("memory")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as MemoryRecord[];
}

export async function deleteMemory(userId: string, id: string): Promise<boolean> {
  const db = requireDb();
  const { error, count } = await db
    .from("memory")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) console.warn("[memory] delete", error.message);
  return (count ?? 0) > 0;
}

/** สรุปข้อความยาวให้เป็นประโยคสั้น เก็บ embed ได้แม่นขึ้น */
export async function summarizeForStorage(text: string): Promise<string> {
  if (text.length <= 300) return text;
  // dynamic import เพื่อ avoid cycle
  const { chat } = await import("@/lib/llm/pool");
  try {
    const res = await chat({
      messages: [
        {
          role: "system",
          content:
            "Summarize the following into 1-2 short Thai sentences, keep all key facts (names, numbers, dates, places).",
        },
        { role: "user", content: text },
      ],
      options: { lite: true, temperature: 0.2, maxOutputTokens: 200, timeoutMs: 15_000 },
    });
    return res.text || text.slice(0, 300);
  } catch (e) {
    // summarize is best-effort — never let a slow/broken LLM error out the
    // whole remember(). Fall back to a truncated original.
    console.warn("[memory] summarize failed, using truncated original:", (e as Error).message);
    return text.slice(0, 300);
  }
}
