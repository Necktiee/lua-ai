/**
 * Embedding jobs worker — retries failed/null embeddings for memory + knowledge.
 */
import { requireDb } from "@/lib/db/client";
import { embedOne } from "@/lib/llm/embed";
import { env } from "@/lib/env";

const MODEL = env.LLM_EMBEDDING_MODEL;
const MAX_ATTEMPTS = 3;

export interface EmbeddingJob {
  id: string;
  user_id: string;
  target_table: "memory" | "knowledge";
  target_id: string;
  content: string;
  model: string | null;
  status: "pending" | "processing" | "done" | "failed";
  attempts: number;
  error: string | null;
}

export async function enqueueEmbeddingJob(args: {
  userId: string;
  targetTable: "memory" | "knowledge";
  targetId: string;
  content: string;
}): Promise<string | null> {
  const db = requireDb();
  const { data, error } = await db
    .from("embedding_jobs")
    .insert({
      user_id: args.userId,
      target_table: args.targetTable,
      target_id: args.targetId,
      content: args.content.slice(0, 8000),
      model: MODEL,
      status: "pending",
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.warn("[embed-jobs] enqueue", error.message);
    return null;
  }
  return (data as { id: string } | null)?.id ?? null;
}

/** Queue reindex for rows marked embedding_status=reindex|failed|null. */
export async function enqueueReindexCandidates(limit = 20): Promise<number> {
  const db = requireDb();
  let n = 0;
  for (const table of ["memory", "knowledge"] as const) {
    const { data } = await db
      .from(table)
      .select("id, user_id, content, embedding_model")
      .in("embedding_status", ["failed", "null", "reindex"])
      .limit(limit);
    for (const row of data ?? []) {
      const r = row as { id: string; user_id: string; content: string; embedding_model?: string | null };
      // Skip if pending job already exists
      const { data: existing } = await db
        .from("embedding_jobs")
        .select("id")
        .eq("target_table", table)
        .eq("target_id", r.id)
        .in("status", ["pending", "processing"])
        .maybeSingle();
      if (existing) continue;
      const id = await enqueueEmbeddingJob({
        userId: r.user_id,
        targetTable: table,
        targetId: r.id,
        content: r.content,
      });
      if (id) n++;
    }
  }
  return n;
}

/**
 * Detect embedding model drift — rows embedded with a different model than
 * the current one. Enqueues them for reindex so vectors stay consistent.
 * This prevents retrieval degradation when the embedding model is upgraded.
 */
export async function enqueueModelDriftCandidates(limit = 50): Promise<number> {
  const db = requireDb();
  let n = 0;
  for (const table of ["memory", "knowledge"] as const) {
    const { data } = await db
      .from(table)
      .select("id, user_id, content, embedding_model")
      .eq("embedding_status", "ok")
      .limit(limit);
    for (const row of data ?? []) {
      const r = row as {
        id: string;
        user_id: string;
        content: string;
        embedding_model?: string | null;
      };
      // JS-side filter catches NULL embedding_model (SQL neq misses NULLs)
      if (r.embedding_model === MODEL) continue;
      // Check existing pending job BEFORE mutating (matches enqueueReindexCandidates pattern)
      const { data: existing } = await db
        .from("embedding_jobs")
        .select("id")
        .eq("target_table", table)
        .eq("target_id", r.id)
        .in("status", ["pending", "processing"])
        .maybeSingle();
      if (existing) continue;
      const id = await enqueueEmbeddingJob({
        userId: r.user_id,
        targetTable: table,
        targetId: r.id,
        content: r.content,
      });
      if (id) {
        await db.from(table).update({ embedding_status: "reindex" }).eq("id", r.id);
        n++;
      }
    }
  }
  return n;
}

async function claimJob(jobId: string): Promise<EmbeddingJob | null> {
  const db = requireDb();
  const { data, error } = await db
    .from("embedding_jobs")
    .update({ status: "processing" })
    .eq("id", jobId)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (error) {
    console.warn("[embed-jobs] claim", error.message);
    return null;
  }
  return (data as EmbeddingJob | null) ?? null;
}

async function applyEmbedding(
  table: "memory" | "knowledge",
  id: string,
  embedding: number[],
): Promise<void> {
  const db = requireDb();
  const { error } = await db
    .from(table)
    .update({
      embedding,
      embedding_model: MODEL,
      embedding_status: "ok",
    })
    .eq("id", id);
  if (error) throw new Error(`apply embedding: ${error.message}`);
}

export interface ProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
  enqueued: number;
}

export async function processEmbeddingJobs(limit = 10): Promise<ProcessResult> {
  const db = requireDb();
  const enqueued = await enqueueReindexCandidates(limit);

  const { data: pending } = await db
    .from("embedding_jobs")
    .select("id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const row of pending ?? []) {
    const job = await claimJob((row as { id: string }).id);
    if (!job) continue;
    processed++;
    const attempts = job.attempts + 1;
    try {
      const vec = await embedOne(job.content.slice(0, 8000));
      await applyEmbedding(job.target_table, job.target_id, vec);
      await db
        .from("embedding_jobs")
        .update({
          status: "done",
          attempts,
          model: MODEL,
          completed_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", job.id);
      succeeded++;
    } catch (e) {
      const status = attempts >= MAX_ATTEMPTS ? "failed" : "pending";
      await db
        .from("embedding_jobs")
        .update({
          status,
          attempts,
          error: (e as Error).message.slice(0, 500),
          completed_at: status === "failed" ? new Date().toISOString() : null,
        })
        .eq("id", job.id);
      // Mark target row failed if terminal
      if (status === "failed") {
        await db
          .from(job.target_table)
          .update({ embedding_status: "failed" })
          .eq("id", job.target_id);
      }
      failed++;
    }
  }

  return { processed, succeeded, failed, enqueued };
}
