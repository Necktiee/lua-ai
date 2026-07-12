/**
 * Dashboard: todos CRUD.
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import { addTodo, deleteTodo, listTodos, updateTodo } from "@/lib/todo/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  const url = new URL(req.url);
  const filter = (url.searchParams.get("filter") as "pending" | "all" | "done") || "pending";
  const todos = await listTodos(userId, filter);
  return Response.json({ todos });
}

export async function POST(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  let body: { title?: string; dueAt?: string; priority?: 1 | 2 | 3 };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.title || typeof body.title !== "string") {
    return Response.json({ error: "title required" }, { status: 400 });
  }
  const todo = await addTodo(userId, body.title, body.dueAt ?? null, body.priority ?? 2);
  return Response.json({ todo });
}

export async function PATCH(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  let body: {
    id?: string;
    title?: string;
    dueAt?: string | null;
    status?: "pending" | "done" | "cancelled";
    priority?: 1 | 2 | 3;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.id) return Response.json({ error: "id required" }, { status: 400 });

  const todo = await updateTodo(userId, body.id, {
    title: body.title,
    dueAt: body.dueAt,
    status: body.status,
    priority: body.priority,
  });
  if (!todo) return Response.json({ error: "todo not found or no changes" }, { status: 404 });
  return Response.json({ todo });
}

export async function DELETE(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const todo = await deleteTodo(userId, id);
  if (!todo) return Response.json({ error: "todo not found" }, { status: 404 });

  const { createUndoToken } = await import("@/lib/undo/store");
  const undo = await createUndoToken({
    userId,
    kind: "todo_delete",
    label: todo.title,
    payload: {
      title: todo.title,
      due_at: todo.due_at,
      priority: todo.priority,
      status: todo.status,
    },
  });

  return Response.json({
    todo,
    receipt: { action: "deleted", target: todo.title },
    undo: undo ? { id: undo.id, expiresAt: undo.expires_at } : null,
  });
}
