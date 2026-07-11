/**
 * Reminder module — schedule ผ่าน Upstash QStash, fire ผ่าน /api/cron/remind.
 *
 * Flow:
 *   1. parse time → fire_at
 *   2. insert reminders row
 *   3. QStash publish ไป ${APP_BASE_URL}/api/cron/remind?id=... ด้วย delay
 *   4. cron route เรียก LINE push แล้ว mark fired
 *
 * Fallback ถ้าไม่มี QStash: cron polling ทุกนาทีที่ /api/cron/poll.
 */
import { env, hasQStash } from "@/lib/env";
import { requireDb, touchUser } from "@/lib/db/client";
import { Client } from "@upstash/qstash";
import type { ReminderRecord } from "@/lib/types";

let qstash: Client | null = null;
function qstashClient() {
  if (!env.QSTASH_TOKEN) return null;
  if (!qstash) qstash = new Client({ token: env.QSTASH_TOKEN });
  return qstash;
}

export async function scheduleReminder(args: {
  userId: string;
  message: string;
  fireAt: string; // ISO
}): Promise<ReminderRecord> {
  const db = requireDb();
  await touchUser(args.userId);
  const fireMs = new Date(args.fireAt).getTime();
  const nowMs = Date.now();
  const delayMs = Math.max(0, fireMs - nowMs);

  // insert ก่อน เพื่อได้ id สำหรับ QStash
  const { data: row, error: insErr } = await db
    .from("reminders")
    .insert({
      user_id: args.userId,
      message: args.message,
      fire_at: args.fireAt,
      qstash_msg_id: null,
      fired: false,
    })
    .select()
    .single();
  if (insErr) throw new Error(`reminder insert: ${insErr.message}`);

  let qstashMsgId: string | null = null;
  const client = qstashClient();
  const MAX_QSTASH_DELAY = 7 * 24 * 60 * 60 * 1000;
  if (client && env.APP_BASE_URL && delayMs < MAX_QSTASH_DELAY) {
    const callback = `${env.APP_BASE_URL.replace(/\/$/, "")}/api/cron/remind`;
    try {
      const res = await client.publishJSON({
        url: callback,
        delay: Math.round(delayMs / 1000),
        body: { id: row.id },
      });
      qstashMsgId = res.messageId ?? null;
      await db.from("reminders").update({ qstash_msg_id: qstashMsgId }).eq("id", row.id);
    } catch (e) {
      console.warn("[remind] qstash publish failed", e);
    }
  } else if (client && !env.APP_BASE_URL) {
    console.warn("[remind] APP_BASE_URL unset — skipping QStash; poll fallback will fire");
  } else if (delayMs >= MAX_QSTASH_DELAY) {
    console.warn("[remind] beyond QStash 7-day limit — relying on poll fallback");
  }
  return row as ReminderRecord;
}

export async function markFired(id: string): Promise<boolean> {
  const db = requireDb();
  const { data, error } = await db
    .from("reminders")
    .update({ fired: true })
    .eq("id", id)
    .eq("fired", false)
    .select("id")
    .maybeSingle();
  if (error) {
    console.warn("[remind] markFired", error.message);
    return false;
  }
  return Boolean(data);
}

/** Undo claim when LINE push fails so poll/QStash can retry. */
export async function releaseFired(id: string): Promise<void> {
  const db = requireDb();
  const { error } = await db.from("reminders").update({ fired: false }).eq("id", id).eq("fired", true);
  if (error) console.warn("[remind] releaseFired", error.message);
}

export async function getReminder(id: string): Promise<ReminderRecord | null> {
  const db = requireDb();
  const { data } = await db.from("reminders").select("*").eq("id", id).maybeSingle();
  return data as ReminderRecord | null;
}

/** ดึง due reminders ที่ยังไม่ fired และเลยเวลาแล้ว (สำหรับ cron polling fallback) */
export async function dueReminders(limit = 20): Promise<ReminderRecord[]> {
  const db = requireDb();
  const { data } = await db
    .from("reminders")
    .select("*")
    .eq("fired", false)
    .lte("fire_at", new Date().toISOString())
    .order("fire_at", { ascending: true })
    .limit(limit);
  // Exclude cron dedup markers (__briefing__:YYYY-MM-DD) if any ever land unfired
  return ((data ?? []) as ReminderRecord[]).filter((r) => !/^__\w+__:\d{4}-\d{2}-\d{2}$/.test(r.message));
}

/**
 * Cancel a reminder by marking it as fired (so it won't fire again).
 * Used when a todo is done/cancelled/deleted — the linked auto-reminder
 * should never fire after the todo is no longer pending.
 */
export async function cancelReminder(id: string): Promise<boolean> {
  const db = requireDb();
  const { data, error } = await db
    .from("reminders")
    .update({ fired: true })
    .eq("id", id)
    .eq("fired", false)
    .select("id")
    .maybeSingle();
  if (error) {
    console.warn("[remind] cancelReminder", error.message);
    return false;
  }
  return Boolean(data);
}

export async function listUpcoming(userId: string, limit = 5): Promise<ReminderRecord[]> {
  const db = requireDb();
  const { data } = await db
    .from("reminders")
    .select("*")
    .eq("user_id", userId)
    .eq("fired", false)
    .gt("fire_at", new Date().toISOString())
    .order("fire_at", { ascending: true })
    .limit(limit);
  return (data ?? []) as ReminderRecord[];
}

export const hasScheduler = hasQStash;
