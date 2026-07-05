/**
 * Dashboard: todos list + create + update (status/priority).
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import { addTodo, listTodos, setStatus, setPriority } from "@/lib/todo/repo";

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

  let body: { id?: string; status?: "pending" | "done" | "cancelled"; priority?: 1 | 2 | 3 };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.id) return Response.json({ error: "id required" }, { status: 400 });

  let todo = null;
  if (body.status) todo = await setStatus(userId, body.id, body.status);
  if (body.priority) todo = await setPriority(userId, body.id, body.priority);
  return Response.json({ todo });
}
