/**
 * POST /api/dashboard/undo — consume undo token and reverse mutation.
 * Body: { id: string }
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import { consumeUndoToken } from "@/lib/undo/store";
import { requireDb, touchUser } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.id || typeof body.id !== "string") {
    return Response.json({ error: "id required" }, { status: 400 });
  }

  const token = await consumeUndoToken(userId, body.id);
  if (!token) {
    return Response.json({ error: "undo expired or already used" }, { status: 410 });
  }

  const db = requireDb();
  await touchUser(userId);

  try {
    switch (token.kind) {
      case "todo_delete": {
        const p = token.payload as {
          title?: string;
          due_at?: string | null;
          priority?: number;
          status?: string;
        };
        const { error } = await db.from("todos").insert({
          user_id: userId,
          title: p.title ?? "กู้คืน",
          due_at: p.due_at ?? null,
          priority: p.priority ?? 2,
          status: p.status ?? "pending",
        });
        if (error) throw new Error(error.message);
        break;
      }
      case "memory_delete": {
        const p = token.payload as {
          kind?: string;
          content?: string;
          tags?: string[];
        };
        const { error } = await db.from("memory").insert({
          user_id: userId,
          kind: p.kind ?? "text",
          content: p.content ?? "",
          tags: p.tags ?? [],
          embedding_status: "reindex",
        });
        if (error) throw new Error(error.message);
        break;
      }
      default:
        return Response.json({ error: `unsupported kind: ${token.kind}` }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  return Response.json({ ok: true, restored: token.label, kind: token.kind });
}
