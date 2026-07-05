/**
 * Dashboard: recent auto-journal entries.
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import { listJournalEntries } from "@/lib/journal/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 14, 1), 60);
  const entries = await listJournalEntries(userId, limit);
  return Response.json({ entries });
}
