/**
 * Dashboard: recent chat message log (user + assistant turns).
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import { listRecentMessages } from "@/lib/memory/conversation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
  const messages = await listRecentMessages(userId, limit);
  return Response.json({ messages });
}
