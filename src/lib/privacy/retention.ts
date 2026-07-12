/**
 * Retention purge — delete memory/messages older than user retention_days.
 * retention_days = 0 means keep forever.
 * Storage attachments are cleaned via deleteMemory.
 */
import { requireDb } from "@/lib/db/client";
import { deleteMemory } from "@/lib/memory/store";

export interface RetentionPurgeResult {
  usersProcessed: number;
  memoriesDeleted: number;
  messagesDeleted: number;
}

export async function purgeExpiredForAllUsers(): Promise<RetentionPurgeResult> {
  const db = requireDb();
  const { data: settings, error } = await db
    .from("user_settings")
    .select("user_id, retention_days")
    .gt("retention_days", 0);
  if (error) {
    console.warn("[retention] settings query", error.message);
    return { usersProcessed: 0, memoriesDeleted: 0, messagesDeleted: 0 };
  }

  let memoriesDeleted = 0;
  let messagesDeleted = 0;
  let usersProcessed = 0;

  for (const row of settings ?? []) {
    const userId = (row as { user_id: string }).user_id;
    const days = (row as { retention_days: number }).retention_days;
    if (!userId || !days || days <= 0) continue;
    usersProcessed++;
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

    const { data: oldMemories } = await db
      .from("memory")
      .select("id")
      .eq("user_id", userId)
      .lt("created_at", cutoff)
      .limit(200);
    for (const m of oldMemories ?? []) {
      const ok = await deleteMemory(userId, (m as { id: string }).id);
      if (ok) memoriesDeleted++;
    }

    const { count, error: msgErr } = await db
      .from("messages")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .lt("created_at", cutoff);
    if (msgErr) console.warn("[retention] messages", msgErr.message);
    else messagesDeleted += count ?? 0;
  }

  return { usersProcessed, memoriesDeleted, messagesDeleted };
}
