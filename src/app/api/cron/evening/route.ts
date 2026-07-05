/**
 * Evening Review cron — fires every minute.
 */
import { authorizeCron } from "@/lib/cron/auth";
import { getUsersDueForBriefing } from "@/lib/settings/repo";
import { filterAllowed } from "@/lib/auth/whitelist";
import { generateEveningReview } from "@/lib/briefing";
import { alreadySentToday, recordSentToday, clearSentToday } from "@/lib/cron/dedup";
import { pushText } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const now = new Date();
  const dueRows = await getUsersDueForBriefing(now, "evening");
  const allowed = new Set(filterAllowed(dueRows.map((r) => r.userId)));
  let sent = 0;
  for (const { userId, timezone } of dueRows) {
    if (!allowed.has(userId)) continue;
    try {
      if (await alreadySentToday(userId, "evening", undefined, timezone)) continue;
      const claimed = await recordSentToday(userId, "evening", undefined, timezone);
      if (!claimed) continue;
      const review = await generateEveningReview(userId, timezone);
      const delivered = await pushText(userId, review);
      if (!delivered) {
        await clearSentToday(userId, "evening", undefined, timezone);
        continue;
      }
      sent++;
    } catch (e) {
      await clearSentToday(userId, "evening", undefined, timezone);
      console.error("[evening-cron] failed for", userId, (e as Error).message);
    }
  }
  return Response.json({ sent, checked: dueRows.length });
}
