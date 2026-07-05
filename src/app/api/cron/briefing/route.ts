/**
 * Daily Briefing cron — fires every minute.
 */
import { authorizeCron } from "@/lib/cron/auth";
import { getUsersDueForBriefing } from "@/lib/settings/repo";
import { filterAllowed } from "@/lib/auth/whitelist";
import { generateDailyBriefing } from "@/lib/briefing";
import { alreadySentToday, recordSentToday, clearSentToday } from "@/lib/cron/dedup";
import { pushText } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const now = new Date();
  const dueRows = await getUsersDueForBriefing(now, "morning");
  const allowed = new Set(filterAllowed(dueRows.map((r) => r.userId)));
  let sent = 0;
  for (const { userId, timezone } of dueRows) {
    if (!allowed.has(userId)) continue;
    try {
      if (await alreadySentToday(userId, "briefing", undefined, timezone)) continue;
      const claimed = await recordSentToday(userId, "briefing", undefined, timezone);
      if (!claimed) continue;
      const briefing = await generateDailyBriefing(userId, timezone);
      const delivered = await pushText(userId, briefing);
      if (!delivered) {
        await clearSentToday(userId, "briefing", undefined, timezone);
        continue;
      }
      sent++;
    } catch (e) {
      await clearSentToday(userId, "briefing", undefined, timezone);
      console.error("[briefing-cron] failed for", userId, (e as Error).message);
    }
  }
  return Response.json({ sent, checked: dueRows.length });
}
