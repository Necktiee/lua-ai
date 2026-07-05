/** Conversation log — sliding context สำหรับ LLM */
import { requireDb } from "@/lib/db/client";
import type { ChatTurn } from "@/lib/llm/types";

export async function logMessage(
  userId: string,
  role: "user" | "assistant" | "system",
  content: string,
  meta?: Record<string, unknown>,
) {
  const db = requireDb();
  const { error } = await db.from("messages").insert({ user_id: userId, role, content, meta });
  if (error) console.warn("[conversation] logMessage", error.message);
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
