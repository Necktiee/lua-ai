/**
 * Follow-up repo — CRUD for follow_ups table.
 * Tracks "sent X / waiting for Y" items for proactive nudging.
 */
import { requireDb, touchUser } from "@/lib/db/client";
import type { FollowUp } from "@/lib/types";

export async function addFollowUp(args: {
  userId: string;
  subject: string;
  waitingFor?: string;
  deadline?: string;
  relatedMemoryId?: string;
}): Promise<FollowUp> {
  const db = requireDb();
  await touchUser(args.userId);
  const { data, error } = await db
    .from("follow_ups")
    .insert({
      user_id: args.userId,
      subject: args.subject,
      waiting_for: args.waitingFor ?? null,
      deadline: args.deadline ?? null,
      related_memory_id: args.relatedMemoryId ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`followup insert: ${error.message}`);
  return data as FollowUp;
}

/** Active follow-ups (open or already nudged but not closed). */
export async function listOpenFollowUps(userId: string): Promise<FollowUp[]> {
  const db = requireDb();
  const { data, error } = await db
    .from("follow_ups")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["open", "nudged"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) console.warn("[followup] list", error.message);
  return (data ?? []) as FollowUp[];
}

export async function closeFollowUp(userId: string, id: string): Promise<boolean> {
  const db = requireDb();
  const { data, error } = await db
    .from("follow_ups")
    .update({ status: "closed" })
    .eq("user_id", userId)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) console.warn("[followup] close", error.message);
  return !!data;
}

export async function markNudged(id: string): Promise<void> {
  const db = requireDb();
  // Atomic increment via RPC (avoids read-then-write TOCTOU race)
  const { error } = await db.rpc("increment_nudge", { fu_id: id });
  if (error) {
    console.warn("[followup] markNudged", error.message);
  }
}

/** Get open follow-ups older than N days (for proactive nudge cron). */
export async function getStaleFollowUps(userId: string, daysOld: number): Promise<FollowUp[]> {
  const db = requireDb();
  const cutoff = new Date(Date.now() - daysOld * 86_400_000).toISOString();
  const { data, error } = await db
    .from("follow_ups")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["open", "nudged"])
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(10);
  if (error) console.warn("[followup] stale", error.message);
  return (data ?? []) as FollowUp[];
}

/** Get all users who have stale follow-ups (for cron). */
export async function getAllStaleFollowUpsByUser(daysOld: number): Promise<Map<string, FollowUp[]>> {
  const db = requireDb();
  const cutoff = new Date(Date.now() - daysOld * 86_400_000).toISOString();
  const { data, error } = await db
    .from("follow_ups")
    .select("*")
    .in("status", ["open", "nudged"])
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) {
    console.warn("[followup] all stale", error.message);
    return new Map();
  }
  const map = new Map<string, FollowUp[]>();
  for (const fu of data ?? []) {
    const arr = map.get(fu.user_id) ?? [];
    arr.push(fu as FollowUp);
    map.set(fu.user_id, arr);
  }
  return map;
}
