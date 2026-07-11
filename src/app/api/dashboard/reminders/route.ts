/**
 * Dashboard: reminder control center — list upcoming + cancel.
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import { listUpcoming, cancelReminder } from "@/lib/remind/schedule";
import { requireDb } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);
  const reminders = await listUpcoming(userId, limit);
  return Response.json({ reminders });
}

export async function DELETE(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  // Verify ownership before cancelling
  const db = requireDb();
  const { data: reminder } = await db
    .from("reminders")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();
  if (!reminder || (reminder as { user_id: string }).user_id !== userId) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const ok = await cancelReminder(id);
  if (!ok) return Response.json({ error: "cancel failed" }, { status: 500 });
  return Response.json({ ok });
}
