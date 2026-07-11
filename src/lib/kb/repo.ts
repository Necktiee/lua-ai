/**
 * Knowledge Base (KB) repo — declarative owner profile, preferences, and
 * standing instructions (SOP).
 *
 * Unlike memory/store.ts (episodic, RAG-only), priority=1 rows here are
 * injected into the agent's context on EVERY turn regardless of semantic
 * similarity. See supabase/migrations/20260706100000_knowledge_kb.sql for the
 * rationale (main chat path never did RAG → never saw the owner's profile).
 */
import { requireDb, touchUser } from "@/lib/db/client";
import { embedOne } from "@/lib/llm/embed";
import type { KnowledgeRecord } from "@/lib/types";

export type KnowledgeCategory = KnowledgeRecord["category"];

export interface UpsertKnowledgeArgs {
  userId: string;
  category: KnowledgeCategory;
  key: string;
  value: string;
  priority?: 1 | 2 | 3;
  source?: KnowledgeRecord["source"];
  sourceType?: string;
  sourceId?: string;
}

/**
 * Insert or update a knowledge fact. Unique on (user_id, category, key) so
 * re-stating a fact ("ชื่อจริง" = ...) overwrites instead of duplicating.
 * When updating, the previous version is archived to knowledge_versions
 * for audit trail and rollback. Embedding is best-effort with model tracking.
 */
export async function upsertKnowledge(
  args: UpsertKnowledgeArgs,
): Promise<KnowledgeRecord> {
  const db = requireDb();
  await touchUser(args.userId);

  // Check if a row already exists (for version archiving)
  const { data: existing } = await db
    .from("knowledge")
    .select("*")
    .eq("user_id", args.userId)
    .eq("category", args.category)
    .eq("key", args.key)
    .maybeSingle();

  // Archive old version if key or value is changing
  if (existing) {
    const old = existing as KnowledgeRecord;
    if (old.value !== args.value || old.key !== args.key) {
      try {
        await db.from("knowledge_versions").insert({
          knowledge_id: old.id,
          user_id: args.userId,
          key: old.key,
          value: old.value,
          category: old.category,
          priority: old.priority,
          source: old.source,
          embedding_model: (old as KnowledgeRecord & { embedding_model?: string }).embedding_model ?? null,
          archived_reason: "updated",
        });
      } catch (e) {
        console.warn("[kb] archive old version failed", (e as Error).message);
      }
    }
  }

  let embedding: number[] | null = null;
  let embeddingModel: string | null = null;
  let embeddingStatus = "null";
  try {
    embedding = await embedOne(`${args.key}: ${args.value}`.slice(0, 8000));
    embeddingModel = "baai/bge-m3";
    embeddingStatus = "ok";
  } catch (err) {
    console.warn("[kb] embed failed:", (err as Error).message);
    embeddingStatus = "failed";
  }

  const row = {
    user_id: args.userId,
    category: args.category,
    key: args.key,
    value: args.value,
    priority: args.priority ?? 2,
    source: args.source ?? "user",
    embedding: embedding ?? null,
    source_type: args.sourceType ?? "user",
    source_id: args.sourceId ?? null,
    content_hash: null,
    embedding_model: embeddingModel,
    embedding_status: embeddingStatus,
    superseded_by: null,
  };

  const { data, error } = await db
    .from("knowledge")
    .upsert(row, { onConflict: "user_id,category,key" })
    .select()
    .single();
  if (error) throw new Error(`knowledge upsert: ${error.message}`);
  return data as KnowledgeRecord;
}

/**
 * All always-inject (priority=1) + optionally priority=2 rows for a user,
 * ordered by priority then recency. Used by buildAgentContext to assemble the
 * always-on PROFILE/SOP layer without a vector search.
 */
export async function listAlwaysInject(
  userId: string,
  maxPriority: 1 | 2 = 2,
): Promise<KnowledgeRecord[]> {
  const db = requireDb();
  const { data, error } = await db
    .from("knowledge")
    .select("*")
    .eq("user_id", userId)
    .lte("priority", maxPriority)
    .order("priority", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(40);
  if (error) console.warn("[kb] listAlwaysInject", error.message);
  return (data ?? []) as KnowledgeRecord[];
}

/** List by category (e.g. all standing SOP rules), newest first. */
export async function listByCategory(
  userId: string,
  category: KnowledgeCategory,
  limit = 50,
): Promise<KnowledgeRecord[]> {
  const db = requireDb();
  const { data, error } = await db
    .from("knowledge")
    .select("*")
    .eq("user_id", userId)
    .eq("category", category)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) console.warn("[kb] listByCategory", error.message);
  return (data ?? []) as KnowledgeRecord[];
}

/** All knowledge for a user (dashboard / export), newest first. */
export async function listKnowledge(
  userId: string,
  limit = 200,
): Promise<KnowledgeRecord[]> {
  const db = requireDb();
  const { data, error } = await db
    .from("knowledge")
    .select("*")
    .eq("user_id", userId)
    .order("priority", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) console.warn("[kb] listKnowledge", error.message);
  return (data ?? []) as KnowledgeRecord[];
}

export interface KnowledgeSearchResult {
  knowledge: KnowledgeRecord;
  similarity: number;
}

const DEFAULT_MIN_SIMILARITY = 0.3;

/**
 * Semantic search over knowledge (for RAG-only priority=3 facts and to enrich
 * the always-inject set with context relevant to the current message). Mirrors
 * memory/store.ts recall(): embed → match_knowledge RPC → min-sim floor →
 * ILIKE fallback when embedding or vector search yields nothing.
 */

/**
 * Hybrid recall — uses the hybrid_knowledge_search RPC which fuses FTS +
 * vector search using RRF. Falls back to recallKnowledge() on RPC failure.
 */
export async function recallKnowledgeHybrid(
  userId: string,
  query: string,
  limit = 5,
  opts?: {
    category?: KnowledgeCategory;
    minSimilarity?: number;
    precomputedVec?: number[];
  },
): Promise<KnowledgeSearchResult[]> {
  const db = requireDb();

  let vec: number[];
  if (opts?.precomputedVec) {
    vec = opts.precomputedVec;
  } else {
    try {
      vec = await embedOne(query.slice(0, 8000));
    } catch {
      return recallKnowledge(userId, query, limit, opts);
    }
  }

  const vecStr = `[${vec.join(",")}]`;
  const { data, error } = await db.rpc("hybrid_knowledge_search", {
    query_text: query.slice(0, 8000),
    query_embedding: vecStr,
    query_user: userId,
    match_count: limit,
    query_category: opts?.category ?? null,
  });

  if (error || !data) {
    return recallKnowledge(userId, query, limit, opts);
  }

  const results: KnowledgeSearchResult[] = (data ?? []).map(
    (r: Record<string, unknown>) => ({
      knowledge: {
        id: r.id as string,
        user_id: userId,
        category: r.category as KnowledgeCategory,
        key: r.key as string,
        value: r.value as string,
        priority: r.priority as 1 | 2 | 3,
        source: r.source as KnowledgeRecord["source"],
        created_at: r.created_at as string,
        updated_at: r.updated_at as string,
      } as KnowledgeRecord,
      similarity: Number(r.rrf_score ?? r.similarity ?? 0),
    }),
  );

  const minSim = opts?.minSimilarity ?? DEFAULT_MIN_SIMILARITY;
  const filtered = results.filter((r) => r.similarity >= minSim);
  return filtered.length > 0 ? filtered : results;
}

export async function recallKnowledge(
  userId: string,
  query: string,
  limit = 5,
  opts?: {
    category?: KnowledgeCategory;
    minSimilarity?: number;
    /**
     * Optional pre-computed query embedding. Lets buildAgentContext reuse the
     * single embedding it already computes for memory recall instead of paying
     * for a second identical embed on every chat turn. When omitted, this
     * embeds the query itself as before.
     */
    precomputedVec?: number[];
  },
): Promise<KnowledgeSearchResult[]> {
  const db = requireDb();

  let vec: number[];
  if (opts?.precomputedVec) {
    vec = opts.precomputedVec;
  } else {
    try {
      vec = await embedOne(query.slice(0, 8000));
    } catch (err) {
      console.warn("[kb] embed failed, using ILIKE fallback:", (err as Error).message);
      return recallTextFallback(db, userId, query, limit, opts?.category);
    }
  }

  const vecStr = `[${vec.join(",")}]`;
  const { data, error } = await db.rpc("match_knowledge", {
    query_embedding: vecStr,
    query_user: userId,
    match_count: limit,
    query_category: opts?.category ?? null,
  });
  if (error) {
    return recallTextFallback(db, userId, query, limit, opts?.category);
  }

  const results: KnowledgeSearchResult[] = (data ?? []).map(
    (r: KnowledgeRecord & { similarity: number | string }) => ({
      knowledge: {
        id: r.id,
        user_id: userId,
        category: r.category,
        key: r.key,
        value: r.value,
        priority: r.priority,
        source: r.source,
        created_at: r.created_at,
        updated_at: r.updated_at,
      } as KnowledgeRecord,
      similarity: Number(r.similarity),
    }),
  );

  const minSim = opts?.minSimilarity ?? DEFAULT_MIN_SIMILARITY;
  const filtered = results.filter((r) => r.similarity >= minSim);
  // Fall back to text search when vector results are empty OR filtered out.
  // Previously, zero-row RPC returns (null embeddings) skipped fallback.
  if (filtered.length === 0) {
    return recallTextFallback(db, userId, query, limit, opts?.category);
  }
  return filtered;
}

async function recallTextFallback(
  db: ReturnType<typeof requireDb>,
  userId: string,
  query: string,
  limit: number,
  category?: KnowledgeCategory,
): Promise<KnowledgeSearchResult[]> {
  // NEVER use PostgREST .or() with interpolated user input — it's filter
  // injection (see AGENTS.md). Run two parameterized .ilike() queries (key +
  // value) and merge, mirroring the safe pattern in people/repo.ts.
  const pattern = `%${escapeIlike(query)}%`;

  const build = (col: "key" | "value") => {
    let q = db
      .from("knowledge")
      .select("*")
      .eq("user_id", userId)
      .ilike(col, pattern);
    if (category) q = q.eq("category", category);
    return q.order("updated_at", { ascending: false }).limit(limit);
  };

  const [byKey, byValue] = await Promise.all([build("key"), build("value")]);
  if (byKey.error) console.warn("[kb] recall fallback (key)", byKey.error.message);
  if (byValue.error) console.warn("[kb] recall fallback (value)", byValue.error.message);

  // merge + dedup by id, preserving key matches first
  const seen = new Set<string>();
  const merged: KnowledgeRecord[] = [];
  for (const k of [...(byKey.data ?? []), ...(byValue.data ?? [])] as KnowledgeRecord[]) {
    if (seen.has(k.id)) continue;
    seen.add(k.id);
    merged.push(k);
  }

  return merged.slice(0, limit).map((k) => ({
    knowledge: k,
    similarity: 0.4,
  }));
}

/** Escape `%`, `_`, and `\` for Postgres ILIKE patterns (parameterized value). */
function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}

export interface UpdateKnowledgeArgs {
  category?: KnowledgeCategory;
  key?: string;
  value?: string;
  priority?: 1 | 2 | 3;
}

/**
 * Update a single knowledge row by id (dashboard edit). Re-embeds when key or
 * value changes so semantic recall doesn't go stale against the old vector.
 * Returns null if the row doesn't exist, no fields changed, or the update
 * would violate the UNIQUE(user_id,category,key) constraint.
 */
export async function updateKnowledge(
  userId: string,
  id: string,
  patch: UpdateKnowledgeArgs,
): Promise<KnowledgeRecord | null> {
  const db = requireDb();

  const updates: Record<string, unknown> = {};
  if (patch.category !== undefined) updates.category = patch.category;
  if (patch.key !== undefined) updates.key = patch.key;
  if (patch.value !== undefined) updates.value = patch.value;
  if (patch.priority !== undefined) updates.priority = patch.priority;
  if (Object.keys(updates).length === 0) return null;

  // Re-embed if key or value changed. Need the merged final key+value, so
  // fetch the current row first.
  if (patch.key !== undefined || patch.value !== undefined) {
    const { data: current } = await db
      .from("knowledge")
      .select("key,value")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (!current) return null;
    const finalKey = patch.key ?? (current as { key: string }).key;
    const finalValue = patch.value ?? (current as { value: string }).value;
    try {
      updates.embedding = await embedOne(`${finalKey}: ${finalValue}`.slice(0, 8000));
    } catch (err) {
      console.warn("[kb] re-embed on update failed:", (err as Error).message);
      updates.embedding = null;
    }
  }

  const { data, error } = await db
    .from("knowledge")
    .update(updates)
    .eq("user_id", userId)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) {
    console.warn("[kb] update", error.message);
    return null;
  }
  return (data as KnowledgeRecord | null) ?? null;
}

export async function deleteKnowledge(userId: string, id: string): Promise<boolean> {
  const db = requireDb();
  const { error, count } = await db
    .from("knowledge")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) console.warn("[kb] delete", error.message);
  return (count ?? 0) > 0;
}
