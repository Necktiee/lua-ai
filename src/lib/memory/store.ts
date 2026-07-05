/**
 * Memory store — บันทึกและค้น semantic ผ่าน pgvector.
 */
import { requireDb, touchUser } from "@/lib/db/client";
import { embed, embedOne } from "@/lib/llm/embed";
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
}

export interface SearchResult {
  memory: MemoryRecord;
  similarity: number;
}

export async function recall(
  userId: string,
  query: string,
  limit = 5,
  filters?: RecallFilters,
): Promise<SearchResult[]> {
  const db = requireDb();

  let vec: number[];
  try {
    vec = await embedOne(query.slice(0, 8000));
  } catch (err) {
    console.warn("[memory] embed failed, using ILIKE fallback:", (err as Error).message);
    return recallTextFallback(db, userId, query, limit, filters);
  }

  // pgvector ต้องการ string format "[0.1,0.2,...]"
  const vecStr = `[${vec.join(",")}]`;

  const hasPostFilter = Boolean(filters?.tag || filters?.startDate || filters?.endDate);
  const rpcLimit = hasPostFilter ? Math.min(limit * 5, 50) : limit;

  const { data, error } = await db.rpc("match_memory", {
    query_embedding: vecStr,
    query_user: userId,
    match_count: rpcLimit,
  });
  if (error) {
    return recallTextFallback(db, userId, query, limit, filters);
  }
  let results: SearchResult[] = (data ?? []).map((r: { id: string; content: string; kind: string; raw: unknown; storage_path: string | null; created_at: string; similarity: number | string; tags?: string[] }) => ({
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

  // Post-filter by tag + date (RPC doesn't support these filters natively)
  if (filters?.tag) {
    const tag = filters.tag;
    results = results.filter((r) => (r.memory.tags ?? []).includes(tag));
  }
  if (filters?.startDate) {
    const start = filters.startDate;
    results = results.filter((r) => r.memory.created_at >= start);
  }
  if (filters?.endDate) {
    const end = filters.endDate;
    results = results.filter((r) => r.memory.created_at < end);
  }
  const sliced = results.slice(0, limit);
  // If post-filter emptied vector hits, fall back to SQL-filtered text search
  if (sliced.length === 0 && hasPostFilter) {
    return recallTextFallback(db, userId, query, limit, filters);
  }
  return sliced;
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
  const res = await chat({
    messages: [
      {
        role: "system",
        content:
          "Summarize the following into 1-2 short Thai sentences, keep all key facts (names, numbers, dates, places).",
      },
      { role: "user", content: text },
    ],
    options: { lite: true, temperature: 0.2, maxOutputTokens: 200 },
  });
  return res.text || text.slice(0, 300);
}
