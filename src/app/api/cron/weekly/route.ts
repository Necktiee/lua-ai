/**
 * Weekly Reflection cron — Gap #3 fix.
 * Fires once/week per user: Sunday local 20:00 (piggybacks the existing
 * getUsersAtLocalTime time-match query, then filters to Sunday in each
 * user's own timezone before generating+pushing the reflection).
 */
import { authorizeCron } from "@/lib/cron/auth";
import { getUsersAtLocalTime } from "@/lib/settings/repo";
import { filterAllowed } from "@/lib/auth/whitelist";
import { generateWeeklyReflection } from "@/lib/reflect/weekly";
import { alreadySentToday, recordSentToday, clearSentToday } from "@/lib/cron/dedup";
import { pushText } from "@/lib/line";
import { localWeekday } from "@/lib/tz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const now = new Date();
  const dueRows = await getUsersAtLocalTime(20, 0);
  const sundayRows = dueRows.filter(({ timezone }) => localWeekday(now, timezone) === 0);
  const allowed = new Set(filterAllowed(sundayRows.map((r) => r.userId)));

  let sent = 0;
  for (const { userId, timezone } of sundayRows) {
    if (!allowed.has(userId)) continue;
    try {
      if (await alreadySentToday(userId, "weekly", undefined, timezone)) continue;
      const claimed = await recordSentToday(userId, "weekly", undefined, timezone);
      if (!claimed) continue;
      const reflection = await generateWeeklyReflection(userId, timezone);
      if (!reflection) continue; // nothing happened this week — skip, but keep the claim (don't retry today)
      const delivered = await pushText(userId, reflection);
      if (!delivered) {
        await clearSentToday(userId, "weekly", undefined, timezone);
        continue;
      }
      sent++;
    } catch (e) {
      await clearSentToday(userId, "weekly", undefined, timezone);
      console.error("[weekly-cron] failed for", userId, (e as Error).message);
    }
  }
  return Response.json({ sent, checked: sundayRows.length });
}
