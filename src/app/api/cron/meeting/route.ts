/**
 * Meeting Prep cron — events starting in ~30 min (28–32 min window).
 */
import { requireDb } from "@/lib/db/client";
import { authorizeCron } from "@/lib/cron/auth";
import { filterAllowed } from "@/lib/auth/whitelist";
import { getEventsStartingSoon, generateMeetingBrief } from "@/lib/meeting/prep";
import { pushText } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const db = requireDb();
  const { data: users } = await db.from("users").select("line_user_id");
  const allowedUsers = filterAllowed((users ?? []).map((u: { line_user_id: string }) => u.line_user_id));

  let sent = 0;
  for (const userId of allowedUsers) {
    try {
      const upcoming = await getEventsStartingSoon(userId, 35);
      for (const event of upcoming) {
        const minsUntil = (new Date(event.start_at).getTime() - Date.now()) / 60_000;
        if (minsUntil < 28 || minsUntil > 32) continue;

        const { data: existing } = await db
          .from("relations")
          .select("id")
          .eq("user_id", userId)
          .eq("from_type", "calendar_event")
          .eq("from_id", event.id)
          .eq("relation", "meeting_brief_sent")
          .maybeSingle();
        if (existing) continue;

        // Claim before expensive LLM + push to reduce duplicate sends on cron overlap
        const { data: claim, error: claimErr } = await db
          .from("relations")
          .insert({
            user_id: userId,
            from_type: "calendar_event",
            from_id: event.id,
            relation: "meeting_brief_sent",
            to_type: "calendar_event",
            to_id: event.id,
          })
          .select("id")
          .single();
        if (claimErr || !claim) continue;

        let brief: string;
        try {
          brief = await generateMeetingBrief(userId, event);
        } catch (e) {
          await db.from("relations").delete().eq("id", claim.id);
          console.error("[meeting-cron] brief failed", userId, (e as Error).message);
          continue;
        }
        const delivered = await pushText(userId, brief);
        if (!delivered) {
          await db.from("relations").delete().eq("id", claim.id);
          continue;
        }
        sent++;
      }
    } catch (e) {
      console.error("[meeting-cron] failed", userId, (e as Error).message);
    }
  }
  return Response.json({ sent });
}
