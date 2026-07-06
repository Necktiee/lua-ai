/**
 * Todo repository.
 */
import { requireDb, touchUser } from "@/lib/db/client";
import type { TodoRecord } from "@/lib/types";

export interface TodoPatch {
  title?: string;
  dueAt?: string | null;
  priority?: 1 | 2 | 3;
  status?: TodoRecord["status"];
}

export async function addTodo(
  userId: string,
  title: string,
  dueAt?: string | null,
  priority: 1 | 2 | 3 = 2,
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
      priority,
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
  const { data, error } = await q
    .order("priority", { ascending: true })
    .order("due_at", { ascending: true, nullsFirst: false });
  if (error) console.warn("[todo] listTodos", error.message);
  return (data ?? []) as TodoRecord[];
}

export async function setPriority(
  userId: string,
  id: string,
  priority: 1 | 2 | 3,
): Promise<TodoRecord | null> {
  return updateTodo(userId, id, { priority });
}

export async function updateTodo(
  userId: string,
  id: string,
  patch: TodoPatch,
): Promise<TodoRecord | null> {
  const updates: Record<string, string | number | null> = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) return null;
    updates.title = title;
  }
  if (patch.dueAt !== undefined) updates.due_at = patch.dueAt;
  if (patch.priority !== undefined) updates.priority = patch.priority;
  if (patch.status !== undefined) {
    updates.status = patch.status;
    updates.completed_at = patch.status === "done" ? new Date().toISOString() : null;
  }
  if (Object.keys(updates).length === 0) return null;

  const db = requireDb();
  const { data, error } = await db
    .from("todos")
    .update(updates)
    .eq("user_id", userId)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) console.warn("[todo] updateTodo", error.message);
  return data as TodoRecord | null;
}

export async function updateByIndex(
  userId: string,
  index: number,
  patch: TodoPatch,
): Promise<TodoRecord | null> {
  if (index < 1) return null;
  const target = await getByIndex(userId, index);
  if (!target) return null;
  return updateTodo(userId, target.id, patch);
}

export async function deleteTodo(
  userId: string,
  id: string,
): Promise<TodoRecord | null> {
  const db = requireDb();
  const { data, error } = await db
    .from("todos")
    .delete()
    .eq("user_id", userId)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) console.warn("[todo] deleteTodo", error.message);
  return data as TodoRecord | null;
}

export async function deleteByIndex(
  userId: string,
  index: number,
): Promise<TodoRecord | null> {
  if (index < 1) return null;
  const target = await getByIndex(userId, index);
  if (!target) return null;
  return deleteTodo(userId, target.id);
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
    .order("priority", { ascending: true })
    .order("due_at", { ascending: true, nullsFirst: false })
    .range(index - 1, index - 1)
    .maybeSingle();
  if (error) console.warn("[todo] getByIndex", error.message);
  return data as TodoRecord | null;
}

/** Pending todos overdue by at least N days (for proactive escalation cron). */
export async function getOverdueTodos(userId: string, minDaysOverdue = 1): Promise<TodoRecord[]> {
  const db = requireDb();
  const cutoff = new Date(Date.now() - minDaysOverdue * 86_400_000).toISOString();
  const { data, error } = await db
    .from("todos")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .lt("due_at", cutoff)
    .order("due_at", { ascending: true })
    .limit(10);
  if (error) console.warn("[todo] overdue", error.message);
  return (data ?? []) as TodoRecord[];
}

/** All users with pending todos overdue by at least N days, grouped (for cron). */
export async function getAllOverdueTodosByUser(minDaysOverdue = 1): Promise<Map<string, TodoRecord[]>> {
  const db = requireDb();
  const cutoff = new Date(Date.now() - minDaysOverdue * 86_400_000).toISOString();
  const { data, error } = await db
    .from("todos")
    .select("*")
    .eq("status", "pending")
    .lt("due_at", cutoff)
    .order("due_at", { ascending: true })
    .limit(200);
  if (error) {
    console.warn("[todo] all overdue", error.message);
    return new Map();
  }
  const map = new Map<string, TodoRecord[]>();
  for (const t of (data ?? []) as TodoRecord[]) {
    const arr = map.get(t.user_id) ?? [];
    arr.push(t);
    map.set(t.user_id, arr);
  }
  return map;
}

export async function setStatus(
  userId: string,
  id: string,
  status: TodoRecord["status"],
): Promise<TodoRecord | null> {
  return updateTodo(userId, id, { status });
}
