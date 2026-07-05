/**
 * Todo repository.
 */
import { requireDb, touchUser } from "@/lib/db/client";
import type { TodoRecord } from "@/lib/types";

export async function addTodo(
  userId: string,
  title: string,
  dueAt?: string | null,
): Promise<TodoRecord> {
  const db = requireDb();
  await touchUser(userId);
  const { data, error } = await db
    .from("todos")
    .insert({
      user_id: userId,
      title,
      due_at: dueAt ?? null,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw new Error(`todo insert: ${error.message}`);
  return data as TodoRecord;
}

export async function listTodos(
  userId: string,
  filter: "pending" | "all" | "done" = "pending",
): Promise<TodoRecord[]> {
  const db = requireDb();
  let q = db.from("todos").select("*").eq("user_id", userId);
  if (filter === "pending") q = q.eq("status", "pending");
  else if (filter === "done") q = q.eq("status", "done");
  const { data, error } = await q.order("due_at", { ascending: true, nullsFirst: false });
  if (error) console.warn("[todo] listTodos", error.message);
  return (data ?? []) as TodoRecord[];
}

/** index = 1-based, อ้างตาม list pending order */
export async function completeByIndex(
  userId: string,
  index: number,
): Promise<TodoRecord | null> {
  if (index < 1) return null;
  const target = await getByIndex(userId, index);
  if (!target) return null;
  return setStatus(userId, target.id, "done");
}

export async function cancelByIndex(
  userId: string,
  index: number,
): Promise<TodoRecord | null> {
  if (index < 1) return null;
  const target = await getByIndex(userId, index);
  if (!target) return null;
  return setStatus(userId, target.id, "cancelled");
}

/** Fetch a single pending todo by 1-based index using OFFSET/LIMIT (no full scan) */
async function getByIndex(
  userId: string,
  index: number,
): Promise<TodoRecord | null> {
  const db = requireDb();
  const { data, error } = await db
    .from("todos")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("due_at", { ascending: true, nullsFirst: false })
    .range(index - 1, index - 1)
    .maybeSingle();
  if (error) console.warn("[todo] getByIndex", error.message);
  return data as TodoRecord | null;
}

export async function setStatus(
  userId: string,
  id: string,
  status: TodoRecord["status"],
): Promise<TodoRecord | null> {
  const db = requireDb();
  const { data, error } = await db
    .from("todos")
    .update({
      status,
      completed_at: status === "done" ? new Date().toISOString() : null,
    })
    .eq("user_id", userId)
    .eq("id", id)
    .select()
    .single();
  if (error) console.warn("[todo] setStatus", error.message);
  return data as TodoRecord | null;
}
