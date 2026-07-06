/**
 * QStash callback — เรียกเมื่อถึงเวลาเตือน.
 * Body: { id: reminderId }
 * ตรวจ signature ด้วย @upstash/qstash Receiver (support key rotation).
 */
import { Receiver } from "@upstash/qstash";
import { env } from "@/lib/env";
import { getReminder, markFired, releaseFired } from "@/lib/remind/schedule";
import { isUserAllowed } from "@/lib/auth/whitelist";
import { pushText } from "@/lib/line";
import { BANGKOK } from "@/lib/tz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const bodyText = await req.text();

  const verified = await verifyQstash(req, bodyText);
  if (!verified) return new Response("bad sig", { status: 401 });

  let body: { id?: string };
  try {
    body = JSON.parse(bodyText);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (!body.id) return new Response("no id", { status: 400 });

  const r = await getReminder(body.id);
  if (!r) return new Response("not found", { status: 404 });
  if (r.fired) return new Response("already fired", { status: 200 });
  if (/^__\w+__:\d{4}-\d{2}-\d{2}$/.test(r.message)) {
    return new Response("cron marker", { status: 200 });
  }
  if (!isUserAllowed(r.user_id)) return new Response("user not allowed", { status: 200 });

  // Claim before push to prevent double-delivery from QStash retry + poll overlap
  const marked = await markFired(r.id);
  if (!marked) return new Response("already fired", { status: 200 });

  try {
    const delivered = await pushText(
      r.user_id,
      `⏰ ${r.message}\n(ตั้งไว้ตั้งแต่ ${new Date(r.created_at).toLocaleString("th-TH", { timeZone: BANGKOK })})`,
    );
    if (!delivered) {
      await releaseFired(r.id);
      console.error("[remind] push failed — released claim", r.id);
      return new Response("push failed", { status: 500 });
    }
  } catch (e) {
    await releaseFired(r.id);
    console.error("[remind] push failed after claim", r.id, (e as Error).message);
    return new Response("push failed", { status: 500 });
  }
  return new Response("ok", { status: 200 });
}

async function verifyQstash(req: Request, body: string): Promise<boolean> {
  if (!env.QSTASH_CURRENT_SIGNING_KEY && !env.QSTASH_NEXT_SIGNING_KEY) {
    // no keys configured — reject all (poll fallback handles reminders)
    console.warn("[qstash] no signing keys — rejecting callback");
    return false;
  }
  try {
    const signature = req.headers.get("upstash-signature") ?? "";
    const receiver = new Receiver({
      currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
    });
    return await receiver.verify({
      signature,
      body,
    });
  } catch (e) {
    console.warn("[qstash] verify failed", e);
    return false;
  }
}
