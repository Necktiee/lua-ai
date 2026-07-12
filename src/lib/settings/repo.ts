/**
 * User settings — per-user preferences (briefing time, timezone, feature toggles).
 * Auto-creates default row on first access.
 */
import { requireDb } from "@/lib/db/client";
import { BANGKOK, localHHMM } from "@/lib/tz";
import type { UserSettings } from "@/lib/types";

/**
 * Cron ticks every CRON_WINDOW_MINUTES (see scripts/setup-schedules / QStash schedules),
 * not every minute — Vercel Hobby + QStash free tier can't sustain per-minute polling
 * for 5 routes within the 1000 msg/day budget. Matching helpers below treat a user's
 * target HH:MM as "due" if `now` falls within [target, target + CRON_WINDOW_MINUTES).
 * Safe because cron/dedup.ts already guarantees at most one push per user/kind/day.
 */
const CRON_WINDOW_MINUTES = 10;

function minutesSinceMidnight(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** True if `nowHHMM` is within [targetHHMM, targetHHMM + CRON_WINDOW_MINUTES) minutes, wrapping midnight. */
function isWithinCronWindow(nowHHMM: string, targetHHMM: string): boolean {
  const now = minutesSinceMidnight(nowHHMM);
  const target = minutesSinceMidnight(targetHHMM);
  let diff = now - target;
  if (diff < 0) diff += 24 * 60;
  return diff < CRON_WINDOW_MINUTES;
}

const DEFAULTS: Omit<UserSettings, "user_id" | "updated_at"> = {
  briefing_time: "07:00",
  evening_time: "21:00",
  briefing_enabled: true,
  evening_enabled: true,
  auto_journal_enabled: true,
  follow_up_nudge_days: 3,
  retention_days: 0,
  quiet_hours_enabled: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
  timezone: "Asia/Bangkok",
};

export async function getSettings(userId: string): Promise<UserSettings> {
  const db = requireDb();
  const { data, error } = await db
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[settings] get", error.message);
  }
  if (data) return data as UserSettings;

  // create default
  const row = { user_id: userId, ...DEFAULTS };
  const { data: created, error: insErr } = await db
    .from("user_settings")
    .insert(row)
    .select()
    .single();
  if (insErr) {
    // race condition: another request created it
    const { data: retry } = await db
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    return (retry ?? { ...row, updated_at: new Date().toISOString() }) as UserSettings;
  }
  return created as UserSettings;
}

export async function updateSettings(
  userId: string,
  patch: Partial<Omit<UserSettings, "user_id" | "updated_at">>,
): Promise<UserSettings> {
  const db = requireDb();
  const { data, error } = await db
    .from("user_settings")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw new Error(`settings update: ${error.message}`);
  return data as UserSettings;
}

/** Get all users whose briefing is due now (within current minute). */
export async function getUsersDueForBriefing(
  now: Date,
  kind: "morning" | "evening",
): Promise<Array<{ userId: string; timezone: string }>> {
  const db = requireDb();
  const timeCol = kind === "morning" ? "briefing_time" : "evening_time";
  const enabledCol = kind === "morning" ? "briefing_enabled" : "evening_enabled";

  const { data, error } = await db
    .from("user_settings")
    .select("user_id, briefing_time, evening_time, timezone")
    .eq(enabledCol, true);
  if (error) {
    console.warn("[settings] due query", error.message);
    return [];
  }

  const result: Array<{ userId: string; timezone: string }> = [];
  for (const row of (data ?? []) as Array<{ user_id: string; briefing_time: string; evening_time: string; timezone: string }>) {
    const targetTime = timeCol === "briefing_time" ? row.briefing_time : row.evening_time;
    const target = targetTime?.slice(0, 5) ?? "";
    const tz = row.timezone || BANGKOK;
    try {
      if (target && isWithinCronWindow(localHHMM(now, tz), target)) {
        result.push({ userId: row.user_id, timezone: tz });
      }
    } catch {
      // Invalid timezone string — skip this user instead of crashing all crons
    }
  }
  return result;
}

/** Get users whose local HH:MM falls in the current cron tick window. */
export async function getUsersAtLocalTime(
  hour: number,
  minute: number,
  opts?: { enabledCol?: "auto_journal_enabled" | "evening_enabled" | "briefing_enabled" },
): Promise<Array<{ userId: string; timezone: string }>> {
  const db = requireDb();
  const now = new Date();
  let query = db.from("user_settings").select("user_id, timezone");
  if (opts?.enabledCol) {
    query = query.eq(opts.enabledCol, true);
  }
  const { data, error } = await query;
  if (error) {
    console.warn("[settings] local time query", error.message);
    return [];
  }
  const target = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const result: Array<{ userId: string; timezone: string }> = [];
  for (const row of (data ?? []) as Array<{ user_id: string; timezone: string }>) {
    const tz = row.timezone || BANGKOK;
    if (isWithinCronWindow(localHHMM(now, tz), target)) {
      result.push({ userId: row.user_id, timezone: tz });
    }
  }
  return result;
}
