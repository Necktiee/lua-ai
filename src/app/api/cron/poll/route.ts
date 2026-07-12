/**
 * Poll fallback — ดึง reminders ที่เลยเวลาแล้ว แล้ว fire (สำหรับกรณี QStash ไม่ได้ตั้ง).
 * Also resets stale webhook_events stuck in 'processing' (worker killed mid-process).
 * Cron: Vercel Cron เรียกทุกนาที, หรือ external cron ยิงมา.
 * Protected ด้วย CRON_SECRET header.
 */
import { authorizeCron } from "@/lib/cron/auth";
import { filterAllowed } from "@/lib/auth/whitelist";
import { dueReminders, markFired, releaseFired } from "@/lib/remind/schedule";
import { staleEvents, dueFailedEvents, resetStale } from "@/lib/webhook/inbox";
import { pushText } from "@/lib/line";
import { BANGKOK } from "@/lib/tz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  let resetCount = 0;
  // Reset stale webhook events (stuck in 'processing' > 5 min) + failed past backoff
  try {
    const stale = await staleEvents(5, 10);
    const failed = await dueFailedEvents(10);
    for (const ev of [...stale, ...failed]) {
      await resetStale(ev.webhook_event_id);
      resetCount++;
    }
  } catch (e) {
    console.warn("[poll] stale webhook reset failed", (e as Error).message);
  }

  const due = await dueReminders(20);
  let fired = 0;
  for (const r of due) {
    if (!filterAllowed([r.user_id]).length) continue;
    let claimed = false;
    try {
      claimed = await markFired(r.id);
      if (!claimed) continue;
      const delivered = await pushText(
        r.user_id,
        `⏰ ${r.message}\n(ตั้งไว้ ${new Date(r.created_at).toLocaleString("th-TH", { timeZone: BANGKOK })})`,
      );
      if (!delivered) {
        await releaseFired(r.id);
        console.error("[poll] push failed — released claim", r.id);
        continue;
      }
      fired++;
    } catch (e) {
      if (claimed) await releaseFired(r.id).catch(() => {});
      console.error("[poll] fire failed", e);
    }
  }
  return Response.json({ fired, total: due.length, webhookResets: resetCount });
}
