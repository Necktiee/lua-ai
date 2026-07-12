/**
 * Auto Journal cron — split from overloaded daily route.
 * Generates nightly journals at user's local 22:00.
 */
import { authorizeCron } from "@/lib/cron/auth";
import { getUsersAtLocalTime } from "@/lib/settings/repo";
import { filterAllowed } from "@/lib/auth/whitelist";
import { generateAndStoreJournal } from "@/lib/journal/repo";
import { alreadySentToday, recordSentToday, clearSentToday } from "@/lib/cron/dedup";
import { pushText } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const now = new Date();
  let journalsCreated = 0;

  const rows = await getUsersAtLocalTime(22, 0, { enabledCol: "auto_journal_enabled" });
  const allowed = new Set(filterAllowed(rows.map((r) => r.userId)));

  for (const { userId, timezone } of rows) {
    if (!allowed.has(userId)) continue;
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

  return Response.json({ journalsCreated });
}
