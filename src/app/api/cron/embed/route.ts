/**
 * Embedding jobs cron — process pending/failed embeddings.
 * Also detects embedding model drift and enqueues reindex candidates.
 * GET /api/cron/embed
 */
import { authorizeCron } from "@/lib/cron/auth";
import { processEmbeddingJobs, enqueueModelDriftCandidates } from "@/lib/embedding/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  try {
    // First pass: detect model drift and enqueue stale embeddings.
    // This runs BEFORE processEmbeddingJobs so drift candidates are
    // picked up in the same tick.
    let driftCount = 0;
    try {
      driftCount = await enqueueModelDriftCandidates(50);
    } catch (e) {
      console.warn("[cron-embed] drift detection", (e as Error).message);
    }
    const result = await processEmbeddingJobs(10);
    return Response.json({ ...result, driftDetected: driftCount });
  } catch (e) {
    console.error("[cron-embed]", (e as Error).message);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
