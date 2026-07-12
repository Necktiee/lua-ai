/**
 * Retention + ephemeral cleanup cron — data lifecycle only.
 * Journal and nudge logic moved to /api/cron/journal and /api/cron/nudge.
 */
import { requireDb } from "@/lib/db/client";
import { authorizeCron } from "@/lib/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const results: Record<string, unknown> = {};

  try {
    const { purgeExpiredForAllUsers } = await import("@/lib/privacy/retention");
    results.retention = await purgeExpiredForAllUsers();
  } catch (e) {
    console.error("[cron-retention] failed", (e as Error).message);
    results.retention = { error: (e as Error).message };
  }

  try {
    const { error: cleanupError } = await requireDb().rpc("cleanup_ephemeral_data", { days_to_keep: 7 });
    results.ephemeralCleanup = cleanupError ? { error: cleanupError.message } : { ok: true };
  } catch (e) {
    console.error("[cron-cleanup] failed", (e as Error).message);
    results.ephemeralCleanup = { error: (e as Error).message };
  }

  return Response.json(results);
}
