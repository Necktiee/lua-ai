/**
 * Dashboard: recent memories.
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import { listRecent, deleteMemory } from "@/lib/memory/store";
import { requireDb } from "@/lib/db/client";

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

  // Snapshot before delete for undo
  const db = requireDb();
  const { data: row } = await db
    .from("memory")
    .select("id, kind, content, tags")
    .eq("user_id", userId)
    .eq("id", body.id)
    .maybeSingle();

  const ok = await deleteMemory(userId, body.id);
  if (!ok) return Response.json({ ok: false }, { status: 404 });

  let undo = null;
  if (row) {
    const { createUndoToken } = await import("@/lib/undo/store");
    const r = row as { kind: string; content: string; tags?: string[] };
    undo = await createUndoToken({
      userId,
      kind: "memory_delete",
      label: r.content.slice(0, 80),
      payload: { kind: r.kind, content: r.content, tags: r.tags ?? [] },
    });
  }

  return Response.json({
    ok: true,
    receipt: { action: "deleted", target: (row as { content?: string } | null)?.content?.slice(0, 80) },
    undo: undo ? { id: undo.id, expiresAt: undo.expires_at } : null,
  });
}
