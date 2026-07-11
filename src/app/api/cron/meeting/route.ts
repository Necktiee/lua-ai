/**
 * Meeting Prep cron — events starting in ~30 min (28–32 min window).
 */
import { requireDb } from "@/lib/db/client";
import { authorizeCron } from "@/lib/cron/auth";
import { filterAllowed } from "@/lib/auth/whitelist";
import { getEventsStartingSoonDetailed, generateMeetingBrief } from "@/lib/meeting/prep";
import { alreadySentToday, recordSentToday, clearSentToday } from "@/lib/cron/dedup";
import { pushText } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const db = requireDb();
  // Only bother checking users who have actually connected Google (Gap #6b —
  // querying everyone every 5 min wastes DB/Google-API calls for users who
  // never connected calendar).
  const { data: connected } = await db.from("google_tokens").select("user_id");
  const allowedUsers = filterAllowed((connected ?? []).map((u: { user_id: string }) => u.user_id));

  let sent = 0;
  let authNotified = 0;
  for (const userId of allowedUsers) {
    try {
      const { events: upcoming, authError } = await getEventsStartingSoonDetailed(userId, 35);

      // Gap #6: notify once/day (not silent console.warn) when Google auth is broken,
      // so the user knows to reconnect instead of just missing meeting briefs.
      if (authError === "expired") {
        try {
          if (!(await alreadySentToday(userId, "google_auth_expired"))) {
            const claimed = await recordSentToday(userId, "google_auth_expired");
            if (claimed) {
              const delivered = await pushText(
                userId,
                "⚠️ การเชื่อมต่อ Google Calendar หลุด (token หมดอายุ/ถูกยกเลิก) — พิมพ์ 'เชื่อม calendar' เพื่อเชื่อมต่อใหม่ ไม่งั้นจะไม่มี brief ก่อนประชุมให้นะ",
              );
              if (!delivered) await clearSentToday(userId, "google_auth_expired");
              else authNotified++;
            }
          }
        } catch (e) {
          console.error("[meeting-cron] auth-notify failed", userId, (e as Error).message);
        }
      }

      for (const event of upcoming) {
        const minsUntil = (new Date(event.start_at).getTime() - Date.now()) / 60_000;
        // Cron ticks every ~10min (QStash schedule) — widen from a narrow 28-32 band
        // to a window that a 10-min tick can't skip. Dedup is via the
        // `meeting_brief_claims` table (per Google event ID), so widening is safe.
        if (minsUntil < 15 || minsUntil > 35) continue;

        // Claim atomically via unique constraint on (user_id, google_event_id).
        // Uses the dedicated meeting_brief_claims table with TEXT event IDs
        // instead of the UUID relations table (Google event IDs are not UUIDs).
        const { data: claim, error: claimErr } = await db
          .from("meeting_brief_claims")
          .insert({
            user_id: userId,
            google_event_id: event.id,
            status: "claimed",
          })
          .select("id")
          .maybeSingle();
        if (claimErr || !claim) continue; // already claimed by overlapping cron

        let brief: string;
        try {
          brief = await generateMeetingBrief(userId, event);
        } catch (e) {
          await db.from("meeting_brief_claims").delete().eq("id", claim.id);
          console.error("[meeting-cron] brief failed", userId, (e as Error).message);
          continue;
        }
        const delivered = await pushText(userId, brief);
        if (!delivered) {
          await db.from("meeting_brief_claims").delete().eq("id", claim.id);
          continue;
        }
        await db.from("meeting_brief_claims").update({ status: "sent" }).eq("id", claim.id);
        sent++;
      }
    } catch (e) {
      console.error("[meeting-cron] failed", userId, (e as Error).message);
    }
  }
  return Response.json({ sent, authNotified });
}
