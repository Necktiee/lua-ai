/** Conversation log — sliding context สำหรับ LLM */
import { requireDb } from "@/lib/db/client";
import type { ChatTurn } from "@/lib/llm/types";

export async function logMessage(
  userId: string,
  role: "user" | "assistant" | "system",
  content: string,
  meta?: Record<string, unknown>,
  delivered?: boolean,
  traceId?: string,
) {
  const db = requireDb();
  const row: Record<string, unknown> = { user_id: userId, role, content, meta };
  if (delivered !== undefined) row.delivered = delivered;
  if (traceId) row.trace_id = traceId;
  const { error } = await db.from("messages").insert(row);
  if (error) console.warn("[conversation] logMessage", error.message);
}

/** Recent messages with metadata, newest first (for dashboard message log). */
export async function listRecentMessages(
  userId: string,
  limit = 50,
): Promise<Array<{ id: number; role: string; content: string; created_at: string }>> {
  const db = requireDb();
  const { data, error } = await db
    .from("messages")
    .select("id, role, content, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) console.warn("[conversation] listRecentMessages", error.message);
  return (data ?? []) as Array<{ id: number; role: string; content: string; created_at: string }>;
}

export async function recentHistory(
  userId: string,
  limit = 12,
): Promise<ChatTurn[]> {
  const db = requireDb();
  const { data, error } = await db
    .from("messages")
    .select("role, content")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) console.warn("[conversation] recentHistory", error.message);
  if (!data) return [];
  return data.reverse().map((r) => ({
    role: r.role as ChatTurn["role"],
    content: r.content,
  }));
}
