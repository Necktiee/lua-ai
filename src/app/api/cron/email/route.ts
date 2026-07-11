/**
 * Urgent Email cron — proactively scans unread Gmail (bounded window) for
 * messages that need urgent attention, notifies once per message, and
 * stores them into memory so they're searchable via recall() later.
 *
 * Mirrors the meeting-prep cron pattern (Gap #6b): only iterates users who
 * actually connected Google (google_tokens rows), not all users.
 */
import { requireDb } from "@/lib/db/client";
import { authorizeCron } from "@/lib/cron/auth";
import { filterAllowed } from "@/lib/auth/whitelist";
import { checkUrgentEmails, updateEmailStatus, releaseEmailClaim } from "@/lib/gmail";
import { remember } from "@/lib/memory/store";
import { alreadySentToday, recordSentToday, clearSentToday } from "@/lib/cron/dedup";
import { pushText } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const db = requireDb();
  const { data: connected } = await db
    .from("google_tokens")
    .select("user_id")
    .ilike("scope", "%gmail.readonly%");
  const allowedUsers = filterAllowed((connected ?? []).map((u: { user_id: string }) => u.user_id));

  let notified = 0;
  let authNotified = 0;
  for (const userId of allowedUsers) {
    try {
      const { urgent, authError } = await checkUrgentEmails(userId, 15);

      // Reuse the same once/day pattern as the meeting cron for a broken
      // Google connection, so the user isn't left wondering why urgent-email
      // alerts silently stopped.
      if (authError === "expired") {
        try {
          if (!(await alreadySentToday(userId, "google_auth_expired"))) {
            const claimed = await recordSentToday(userId, "google_auth_expired");
            if (claimed) {
              const delivered = await pushText(
                userId,
                "⚠️ การเชื่อมต่อ Google หลุด (token หมดอายุ/ถูกยกเลิก) — พิมพ์ 'เชื่อม calendar' เพื่อเชื่อมต่อใหม่ ไม่งั้นจะไม่มีการแจ้งเมลด่วนให้นะ",
              );
              if (!delivered) await clearSentToday(userId, "google_auth_expired");
              else authNotified++;
            }
          }
        } catch (e) {
          console.error("[email-cron] auth-notify failed", userId, (e as Error).message);
        }
        continue;
      }

      if (urgent.length === 0) continue;

      for (const mail of urgent) {
        try {
          const content = `📧 อีเมลด่วน: ${mail.subject}\nจาก: ${mail.from}\n\n${mail.body || mail.snippet}`;
          // Persist into memory so it's searchable later via recall() — same
          // treatment every other input kind (text/image/audio/link) already gets.
          await remember({
            userId,
            kind: "text",
            content: content.slice(0, 4000),
            raw: { gmailMessageId: mail.id, from: mail.from, subject: mail.subject },
            tags: ["email", "urgent"],
          });

          const delivered = await pushText(
            userId,
            `🔴 เมลด่วนที่อาจต้องรีบตอบ\n\nจาก: ${mail.from}\nเรื่อง: ${mail.subject}\n${mail.snippet.slice(0, 150)}\n\nพิมพ์ "สรุปเมล" เพื่อดูรายละเอียด หรือ "ตอบเมล ..." เพื่อร่างคำตอบ`,
          );
          if (delivered) {
            await updateEmailStatus(userId, mail.id, "sent");
            notified++;
          } else {
            // Push failed — release the pending claim so next cron tick retries
            await releaseEmailClaim(userId, mail.id);
          }
        } catch (e) {
          console.error("[email-cron] notify failed", userId, mail.id, (e as Error).message);
          // Release claim so it can be retried
          try { await releaseEmailClaim(userId, mail.id); } catch { /* ignore */ }
        }
      }
    } catch (e) {
      console.error("[email-cron] failed", userId, (e as Error).message);
    }
  }
  return Response.json({ notified, authNotified, checked: allowedUsers.length });
}
