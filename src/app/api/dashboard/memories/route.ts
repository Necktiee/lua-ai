/**
 * Dashboard: recent memories (everything the user sent in to remember —
 * text/link/image/audio/file). Complements /api/dashboard/meetings and
 * /api/dashboard/journal which only show tag-filtered subsets; this shows
 * the raw remember() feed so notes without a special tag are visible too.
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import { listRecent, deleteMemory } from "@/lib/memory/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);
  const memories = await listRecent(userId, limit);
  return Response.json({ memories });
}

export async function DELETE(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.id) return Response.json({ error: "id required" }, { status: 400 });

  const ok = await deleteMemory(userId, body.id);
  return Response.json({ ok });
}
