/**
 * Auto Journal + Follow-up nudge cron — runs every minute.
 * - Journal: user's local 22:00 (auto_journal_enabled).
 * - Nudge: user's local 09:00.
 */
import { requireDb } from "@/lib/db/client";
import { authorizeCron } from "@/lib/cron/auth";
import { getUsersAtLocalTime } from "@/lib/settings/repo";
import { filterAllowed } from "@/lib/auth/whitelist";
import { generateAndStoreJournal } from "@/lib/journal/repo";
import { getAllStaleFollowUpsByUser, markNudged } from "@/lib/followup/repo";
import { alreadySentToday, recordSentToday, clearSentToday } from "@/lib/cron/dedup";
import { pushText } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const now = new Date();
  const results: Record<string, unknown> = {};

  const journalRows = await getUsersAtLocalTime(22, 0, { enabledCol: "auto_journal_enabled" });
  const journalAllowed = new Set(filterAllowed(journalRows.map((r) => r.userId)));
  let journalsCreated = 0;
  for (const { userId, timezone } of journalRows) {
    if (!journalAllowed.has(userId)) continue;
    try {
      if (await alreadySentToday(userId, "journal", undefined, timezone)) continue;
      const claimed = await recordSentToday(userId, "journal", undefined, timezone);
      if (!claimed) continue;
      const entry = await generateAndStoreJournal(userId, now, timezone);
      if (!entry) {
        await clearSentToday(userId, "journal", undefined, timezone);
        continue;
      }
      const preview = entry.content.length > 500 ? `${entry.content.slice(0, 500)}…` : entry.content;
      const delivered = await pushText(userId, `📓 ไดอารี่วันนี้\n\n${preview}`);
      if (!delivered) {
        await clearSentToday(userId, "journal", undefined, timezone);
        continue;
      }
      journalsCreated++;
    } catch (e) {
      await clearSentToday(userId, "journal", undefined, timezone);
      console.error("[cron-journal] failed", userId, (e as Error).message);
    }
  }
  results.journalsCreated = journalsCreated;

  const nudgeRows = await getUsersAtLocalTime(9, 0);
  const nudgeUsers = filterAllowed(nudgeRows.map((r) => r.userId));
  const nudgeTz = new Map(nudgeRows.map((r) => [r.userId, r.timezone]));
  if (nudgeUsers.length > 0) {
    const db = requireDb();
    const { data: allSettings } = await db
      .from("user_settings")
      .select("user_id, follow_up_nudge_days")
      .in("user_id", nudgeUsers);
    const settingsMap = new Map<string, number>();
    for (const s of allSettings ?? []) {
      settingsMap.set(s.user_id, s.follow_up_nudge_days ?? 3);
    }

    const thresholds = Array.from(new Set(settingsMap.values()));
    let nudged = 0;
    for (const threshold of thresholds) {
      const byUser = await getAllStaleFollowUpsByUser(threshold);
      for (const [userId, followUps] of byUser) {
        if (!nudgeUsers.includes(userId)) continue;
        if (settingsMap.get(userId) !== threshold) continue;
        if (followUps.length === 0) continue;
        try {
          const tz = nudgeTz.get(userId);
          if (await alreadySentToday(userId, "nudge", undefined, tz)) continue;
          const claimed = await recordSentToday(userId, "nudge", undefined, tz);
          if (!claimed) continue;
          const lines = followUps.slice(0, 3).map((f) => {
            const days = Math.floor((Date.now() - new Date(f.created_at).getTime()) / 86_400_000);
            return `• "${f.subject}"${f.waiting_for ? ` (รอ ${f.waiting_for})` : ""} — ${days} วันแล้ว`;
          });
          const delivered = await pushText(userId, `🔁 มี ${followUps.length} เรื่องรอติดตามนานแล้ว:\n${lines.join("\n")}\n\nจะให้ช่วยติดตามไหม?`);
          if (!delivered) {
            await clearSentToday(userId, "nudge", undefined, tz);
            continue;
          }
          for (const f of followUps.slice(0, 3)) {
            await markNudged(f.id);
          }
          nudged += followUps.length;
        } catch (e) {
          await clearSentToday(userId, "nudge", undefined, nudgeTz.get(userId));
          console.error("[cron-nudge] failed", userId, (e as Error).message);
        }
      }
    }
    results.nudged = nudged;
  }

  return Response.json(results);
}
