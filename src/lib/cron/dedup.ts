/**
 * Cron send dedup — one push per user per kind per calendar day (user-local TZ when provided).
 * Uses reminders table as a lightweight sent-log (fired=true, synthetic message).
 */
import { requireDb, touchUser } from "@/lib/db/client";
import { bangkokDateStr, localDateStr } from "@/lib/tz";

export type CronPushKind =
  | "briefing"
  | "evening"
  | "journal"
  | "nudge"
  | "overdue_todo"
  | "weekly"
  | "google_auth_expired"
  | "calendar_mirror_failed";

function marker(kind: CronPushKind, day: string): string {
  return `__${kind}__:${day}`;
}

function dayKey(day?: string, timeZone?: string): string {
  if (day) return day;
  return timeZone ? localDateStr(new Date(), timeZone) : bangkokDateStr();
}

export async function alreadySentToday(
  userId: string,
  kind: CronPushKind,
  day?: string,
  timeZone?: string,
): Promise<boolean> {
  const dayStr = dayKey(day, timeZone);
  const db = requireDb();
  const { data, error } = await db
    .from("reminders")
    .select("id")
    .eq("user_id", userId)
    .eq("message", marker(kind, dayStr))
    .limit(1)
    .maybeSingle();
  if (error) console.warn("[cron-dedup] check", error.message);
  return !!data;
}

/** Returns true if this worker won the send claim; false if another worker already claimed today. */
export async function recordSentToday(
  userId: string,
  kind: CronPushKind,
  day?: string,
  timeZone?: string,
): Promise<boolean> {
  const dayStr = dayKey(day, timeZone);
  const db = requireDb();
  await touchUser(userId);
  const { error } = await db.from("reminders").insert({
    user_id: userId,
    message: marker(kind, dayStr),
    fire_at: new Date().toISOString(),
    fired: true,
  });
  if (!error) return true;
  if (error.message.includes("duplicate") || error.code === "23505") return false;
  console.warn("[cron-dedup] record", error.message);
  return false;
}

/** Roll back claim when push fails so cron can retry on next tick. */
export async function clearSentToday(
  userId: string,
  kind: CronPushKind,
  day?: string,
  timeZone?: string,
): Promise<void> {
  const dayStr = dayKey(day, timeZone);
  const db = requireDb();
  const { error } = await db
    .from("reminders")
    .delete()
    .eq("user_id", userId)
    .eq("message", marker(kind, dayStr));
  if (error) console.warn("[cron-dedup] clear", error.message);
}
