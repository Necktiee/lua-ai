/**
 * Memory store — บันทึกและค้น semantic ผ่าน pgvector.
 */
import { requireDb, touchUser } from "@/lib/db/client";
import { embedOne } from "@/lib/llm/embed";
import type { MemoryRecord } from "@/lib/types";

/** SHA-256 content hash for dedup (hex digest). */
export async function contentHash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function remember(args: {
  userId: string;
  kind: MemoryRecord["kind"];
  content: string;
  raw?: Record<string, unknown>;
  storagePath?: string;
  tags?: string[];
  sourceType?: string;
  sourceId?: string;
}): Promise<MemoryRecord> {
  const db = requireDb();
  await touchUser(args.userId);

  // Content hash for dedup — if a memory with the same hash already exists
  // for this user, return it instead of creating a duplicate.
  const hash = await contentHash(args.content);
  const { data: existing } = await db
    .from("memory")
    .select("*")
    .eq("user_id", args.userId)
    .eq("content_hash", hash)
    .maybeSingle();
  if (existing) return existing as MemoryRecord;

  let embedding: number[] | null = null;
  let embeddingModel: string | null = null;
  let embeddingStatus = "null";
  try {
    embedding = await embedOne(args.content.slice(0, 8000));
    embeddingModel = "baai/bge-m3";
    embeddingStatus = "ok";
  } catch (err) {
    console.warn("[memory] embed failed:", (err as Error).message);
    embeddingStatus = "failed";
  }

  const row = {
    user_id: args.userId,
    kind: args.kind,
    content: args.content,
    raw: args.raw ?? null,
    storage_path: args.storagePath ?? null,
    embedding: embedding ?? null,
    tags: args.tags ?? [],
    source_type: args.sourceType ?? "line_text",
    source_id: args.sourceId ?? null,
    content_hash: hash,
    embedding_model: embeddingModel,
    embedding_status: embeddingStatus,
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

/**
 * Hybrid recall — uses the hybrid_memory_search RPC which fuses FTS + vector
 * search using Reciprocal Rank Fusion (RRF). Falls back to the original
 * recall() (vector-only + ILIKE) if the RPC fails.
 */
export async function recallHybrid(
  userId: string,
  query: string,
  limit = 5,
  filters?: RecallFilters,
  precomputedVec?: number[],
): Promise<SearchResult[]> {
  const db = requireDb();

  let vec: number[];
  if (precomputedVec) {
    vec = precomputedVec;
  } else {
    try {
      vec = await embedOne(query.slice(0, 8000));
    } catch {
      return recall(userId, query, limit, filters);
    }
  }

  const vecStr = `[${vec.join(",")}]`;
  const { data, error } = await db.rpc("hybrid_memory_search", {
    query_text: query.slice(0, 8000),
    query_embedding: vecStr,
    query_user: userId,
    match_count: limit,
    query_tag: filters?.tag ?? null,
    query_start: filters?.startDate ?? null,
    query_end: filters?.endDate ?? null,
  });

  if (error || !data) {
    return recall(userId, query, limit, filters, vec);
  }

  const results: SearchResult[] = (data ?? []).map(
    (r: Record<string, unknown>) => ({
      memory: {
        id: r.id as string,
        user_id: userId,
        kind: r.kind as MemoryRecord["kind"],
        content: r.content as string,
        raw: r.raw as Record<string, unknown>,
        storage_path: r.storage_path as string | null,
        tags: r.tags as string[],
        created_at: r.created_at as string,
      } as MemoryRecord,
      similarity: Number(r.rrf_score ?? r.similarity ?? 0),
    }),
  );

  const minSim = filters?.minSimilarity ?? DEFAULT_MIN_SIMILARITY;
  const filtered = results.filter((r) => r.similarity >= minSim);
  if (filtered.length === 0 && results.length === 0) {
    return recallTextFallback(db, userId, query, limit, filters);
  }
  return filtered.length > 0 ? filtered : results;
}

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

  // If the vector search returned zero rows OR the similarity filter emptied
  // the results, fall back to SQL-filtered text search. Previously, zero-row
  // RPC returns (e.g. null embeddings in DB) skipped fallback entirely,
  // making those memories permanently undiscoverable.
  if (filtered.length === 0) {
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

/**
 * Delete memory entries that originated from a specific LINE message ID.
 * Used by LINE unsend handling — when a user unsends a message, all derived
 * data (memory, attachments) should be cleaned up.
 * The message ID is stored in the `raw` jsonb field.
 */
export async function deleteMemoryByMessageId(userId: string, messageId: string): Promise<number> {
  const db = requireDb();
  // Find memories where raw contains the LINE message ID
  // The raw field stores { lineMessageId: "..." } for text/image/audio/file
  const { data: rows, error: findErr } = await db
    .from("memory")
    .select("id,storage_path")
    .eq("user_id", userId)
    .contains("raw", { lineMessageId: messageId });
  if (findErr) {
    console.warn("[memory] deleteByMessageId find", findErr.message);
    return 0;
  }
  const memories = (rows ?? []) as Array<{ id: string; storage_path?: string | null }>;
  if (memories.length === 0) return 0;

  // Delete each memory (with attachment cleanup)
  for (const m of memories) {
    await deleteMemory(userId, m.id);
  }
  return memories.length;
}

export async function deleteMemory(userId: string, id: string): Promise<boolean> {
  const db = requireDb();
  // Fetch storage_path before deleting so we can clean up the Storage object
  const { data: row } = await db
    .from("memory")
    .select("storage_path")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  const storagePath = (row as { storage_path?: string | null } | null)?.storage_path ?? null;

  const { error, count } = await db
    .from("memory")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) console.warn("[memory] delete", error.message);
  const deleted = (count ?? 0) > 0;

  // Best-effort Storage cleanup — don't fail the memory deletion if Storage fails
  if (deleted && storagePath) {
    try {
      const { deleteAttachment } = await import("@/lib/storage");
      await deleteAttachment(storagePath);
    } catch (e) {
      console.warn("[memory] attachment cleanup failed", (e as Error).message);
    }
  }
  return deleted;
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
