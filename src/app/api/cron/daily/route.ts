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
import { getAllNudgeableFollowUpsByUser, markNudged, nudgeTier } from "@/lib/followup/repo";
import { getAllOverdueTodosByUser } from "@/lib/todo/repo";
import { alreadySentToday, recordSentToday, clearSentToday } from "@/lib/cron/dedup";
import { pushText } from "@/lib/line";
import { BANGKOK } from "@/lib/tz";

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
      const byUser = await getAllNudgeableFollowUpsByUser(threshold);
      for (const [userId, followUps] of byUser) {
        if (!nudgeUsers.includes(userId)) continue;
        if (settingsMap.get(userId) !== threshold) continue;
        if (followUps.length === 0) continue;
        try {
          const tz = nudgeTz.get(userId);
          if (await alreadySentToday(userId, "nudge", undefined, tz)) continue;
          const claimed = await recordSentToday(userId, "nudge", undefined, tz);
          if (!claimed) continue;
          const batch = followUps.slice(0, 3);
          const lines = batch.map((f) => {
            const days = Math.floor((Date.now() - new Date(f.created_at).getTime()) / 86_400_000);
            return `• "${f.subject}"${f.waiting_for ? ` (รอ ${f.waiting_for})` : ""} — ${days} วันแล้ว (เตือนครั้งที่ ${f.nudged_count + 1})`;
          });
          // Escalate tone by the highest nudge count in this batch.
          const tier = nudgeTier(Math.max(...batch.map((f) => f.nudged_count)));
          const header =
            tier === "final"
              ? `⚠️ นี่เป็นการเตือนครั้งสุดท้ายสำหรับ ${followUps.length} เรื่องที่ค้างมานาน:`
              : tier === "urgent"
                ? `🔴 ยังไม่มีความคืบหน้า ${followUps.length} เรื่อง — ค้างนานแล้ว:`
                : `🔁 มี ${followUps.length} เรื่องรอติดตามนานแล้ว:`;
          const footer =
            tier === "final"
              ? "\n\nถ้าไม่ต้องติดตามแล้วพิมพ์ 'ปิดเรื่องแรก' (หรือระบุอันดับ) ไม่งั้นเดี๋ยวจะยังโผล่ในสรุปประจำวันไปเรื่อยๆ"
              : "\n\nจะให้ช่วยติดตามไหม? หรือพิมพ์ 'ปิดเรื่องแรก' ถ้าจบแล้ว";
          const delivered = await pushText(userId, `${header}\n${lines.join("\n")}${footer}`);
          if (!delivered) {
            await clearSentToday(userId, "nudge", undefined, tz);
            continue;
          }
          for (const f of batch) {
            await markNudged(f.id);
          }
          nudged += batch.length;
        } catch (e) {
          await clearSentToday(userId, "nudge", undefined, nudgeTz.get(userId));
          console.error("[cron-nudge] failed", userId, (e as Error).message);
        }
      }
    }
    results.nudged = nudged;
  }

  // Overdue todos — escalate daily at user's local 09:00 (separate from the once-a-day
  // mention in the morning briefing, and independent of briefing_enabled).
  if (nudgeUsers.length > 0) {
    let todoNudged = 0;
    const byUser = await getAllOverdueTodosByUser(1);
    for (const [userId, todos] of byUser) {
      if (!nudgeUsers.includes(userId)) continue;
      if (todos.length === 0) continue;
      try {
        const tz = nudgeTz.get(userId) ?? BANGKOK;
        if (await alreadySentToday(userId, "overdue_todo", undefined, tz)) continue;
        const claimed = await recordSentToday(userId, "overdue_todo", undefined, tz);
        if (!claimed) continue;
        const lines = todos.slice(0, 5).map((t) => {
          const days = Math.floor((Date.now() - new Date(t.due_at!).getTime()) / 86_400_000);
          return `• ${t.title} — เลยกำหนด ${days} วัน`;
        });
        const delivered = await pushText(
          userId,
          `⏰ งานที่เลยกำหนดแล้วยังไม่เสร็จ (${todos.length} งาน):\n${lines.join("\n")}\n\nพิมพ์ 'ทำอันแรกเสร็จแล้ว' หรือ 'ยกเลิกงานอันแรก' ได้เลย`,
        );
        if (!delivered) {
          await clearSentToday(userId, "overdue_todo", undefined, tz);
          continue;
        }
        todoNudged += todos.length;
      } catch (e) {
        await clearSentToday(userId, "overdue_todo", undefined, nudgeTz.get(userId));
        console.error("[cron-overdue-todo] failed", userId, (e as Error).message);
      }
    }
    results.overdueTodoNudged = todoNudged;
  }

  return Response.json(results);
}
