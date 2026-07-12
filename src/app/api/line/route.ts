/**
 * LINE webhook — receive + verify signature + durable inbox + dispatch.
 *
 * Flow:
 *   1. Verify HMAC signature over raw body.
 *   2. Parse payload, extract webhookEventId per event.
 *   3. Persist each event to webhook_events (unique on webhookEventId).
 *      Duplicates are silently skipped (LINE redelivery is safe).
 *   4. Return 200 immediately (LINE 1s timeout).
 *   5. In after(): claim each pending event, process, mark done/failed.
 *
 * If the worker is killed after step 4, events remain in 'pending' and
 * the poll cron (or next webhook with the same event) picks them up.
 */
import { after } from "next/server";
import { env } from "@/lib/env";
import {
  validateSignature,
  fetchMessageContent,
  pushText,
  pushMessages,
  replyText,
  replyMessages,
  startLoadingAnimation,
} from "@/lib/line";
import { handle } from "@/lib/agent/handle";
import { getPromptVersions } from "@/lib/agent/prompts";
import { signOAuthState } from "@/lib/auth/oauth-state";
import { receiveEvent, claimEvent, markDone, markFailed } from "@/lib/webhook/inbox";
import { logMessage } from "@/lib/memory/conversation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface LineEvent {
  type: string;
  webhookEventId?: string;
  replyToken?: string;
  source?: { userId?: string; displayName?: string };
  message?: {
    type: string;
    id: string;
    text?: string;
  };
  unsend?: { messageId: string };
  postback?: { data: string; params?: Record<string, unknown> };
}

export async function POST(req: Request) {
  const body = await req.text();

  const sig = req.headers.get("x-line-signature") ?? "";
  const ok = await validateSignature(body, sig);
  if (!ok) return new Response("invalid signature", { status: 401 });

  let payload: { events?: LineEvent[] };
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const events = payload.events ?? [];

  // Persist all events to the durable inbox BEFORE returning 200.
  // Duplicates (same webhookEventId) are silently skipped.
  const newEventIds: string[] = [];
  for (const ev of events) {
    // Handle unsend events — delete/tombstone derived data
    if (ev.type === "unsend" && ev.source?.userId && ev.unsend?.messageId) {
      const webhookEventId = ev.webhookEventId ?? `unsend-${ev.unsend.messageId}-${Date.now()}`;
      const inserted = await receiveEvent({
        webhookEventId,
        userId: ev.source.userId,
        sourceType: "user",
        messageType: "unsend",
        messageId: ev.unsend.messageId,
        textContent: "",
      });
      if (inserted) newEventIds.push(webhookEventId);
      continue;
    }

    if (ev.type !== "message" && ev.type !== "postback") continue;
    const webhookEventId = ev.webhookEventId ?? ev.message?.id ?? crypto.randomUUID();
    const userId = ev.source?.userId ?? undefined;
    const text = ev.type === "postback"
      ? (ev.postback?.data ?? "")
      : ev.message?.type === "text" ? (ev.message.text ?? "").trim() : "";
    const inserted = await receiveEvent({
      webhookEventId,
      userId,
      replyToken: ev.replyToken,
      sourceType: ev.source ? "user" : undefined,
      messageType: ev.type === "postback" ? "postback" : ev.message?.type,
      messageId: ev.message?.id,
      textContent: text,
    });
    if (inserted) newEventIds.push(webhookEventId);
  }

  // Process only newly inserted events in after().
  after(async () => {
    for (const eventId of newEventIds) {
      await processEvent(eventId);
    }
  });

  return new Response("ok", { status: 200 });
}

async function processEvent(webhookEventId: string): Promise<void> {
  const claimed = await claimEvent(webhookEventId);
  if (!claimed) return;

  try {
    const userId = claimed.user_id;
    if (!userId) {
      await markDone(webhookEventId);
      return;
    }

    if (
      env.LINE_USER_WHITELIST.length > 0 &&
      !env.LINE_USER_WHITELIST.includes(userId)
    ) {
      await markDone(webhookEventId);
      return;
    }

    const text = claimed.text_content ?? "";
    const replyToken = claimed.reply_token ?? undefined;

    // Handle unsend event — delete derived data for the unsent message
    if (claimed.message_type === "unsend" && claimed.message_id) {
      try {
        const { deleteMemoryByMessageId } = await import("@/lib/memory/store");
        await deleteMemoryByMessageId(userId, claimed.message_id);
      } catch (e) {
        console.warn("[webhook] unsend cleanup failed", (e as Error).message);
      }
      await markDone(webhookEventId);
      return;
    }

    // Handle postback event — structured button tap from Flex message
    if (claimed.message_type === "postback") {
      const data = claimed.text_content ?? "";
      try {
        const { handlePostback } = await import("@/lib/agent/postback");
        const result = await handlePostback(userId, data, webhookEventId);
        if (replyToken) {
          const sent = await replyText(replyToken, result.text);
          if (!sent) await pushText(userId, result.text);
        } else {
          await pushText(userId, result.text);
        }
        await logMessage(userId, "assistant", result.text, { delivered: true }, true, claimed.trace_id ?? undefined);
      } catch (e) {
        console.error("[webhook] postback error", e);
        await pushText(userId, "ขออภัย มีข้อผิดพลาด");
        await markFailed(webhookEventId, (e as Error).message);
        return;
      }
      await markDone(webhookEventId);
      return;
    }

    await startLoadingAnimation(userId, 20);

    if (isCalendarConnectIntent(text)) {
      if (!env.APP_BASE_URL) {
        await pushText(userId, "ยังตั้งค่า APP_BASE_URL ไม่ครบ — ใส่ URL สาธารณะ (เช่น cloudflared tunnel) ใน .env.local ก่อนเชื่อม calendar");
        await markDone(webhookEventId);
        return;
      }
      const { canonicalUserId } = await import("@/lib/auth/owner");
      const ownerId = canonicalUserId(userId);
      const state = await signOAuthState(ownerId);
      const url = `${env.APP_BASE_URL.replace(/\/$/, "")}/api/cal/connect?state=${encodeURIComponent(state)}`;
      await pushText(userId, `เปิดลิงก์นี้เพื่อเชื่อม Google Calendar:\n${url}`);
      await markDone(webhookEventId);
      return;
    }

    if (isDashboardIntent(text)) {
      if (!env.LIFF_ID) {
        await pushText(userId, "ยังไม่ได้เปิด LIFF dashboard — ตั้งค่า LIFF_ID ก่อน");
      } else {
        await pushText(userId, `เปิด dashboard ของแจ๋วได้ที่ลิงก์นี้:\nhttps://liff.line.me/${env.LIFF_ID}`);
      }
      await markDone(webhookEventId);
      return;
    }

    let attachment:
      | { kind: "image" | "audio" | "file"; messageId: string; contentType: string; buffer?: ArrayBuffer }
      | undefined;
    if (claimed.message_type && ["image", "audio", "file"].includes(claimed.message_type) && claimed.message_id) {
      try {
        const fetched = await fetchMessageContent(claimed.message_id);
        attachment = {
          kind: claimed.message_type as "image" | "audio" | "file",
          messageId: claimed.message_id,
          contentType: fetched.contentType,
          buffer: fetched.buf,
        };
      } catch (e) {
        console.warn("[line] content fetch failed", e);
      }
    }

    try {
      const reply = await handle({
        userId,
        text,
        hasAttachment: Boolean(attachment),
        attachment,
        webhookEventId,
        traceId: claimed.trace_id ?? undefined,
      });
      const replyIsFlex = typeof reply !== "string";
      const replyText_ = replyIsFlex ? reply.text : reply;

      let delivered = false;
      if (replyToken) {
        delivered = replyIsFlex
          ? await replyMessages(replyToken, reply.messages)
          : await replyText(replyToken, replyText_);
        if (!delivered) {
          console.warn("[webhook] reply failed, falling back to push", userId);
          if (replyIsFlex) {
            const pushOk = await pushMessages(userId, reply.messages);
            if (!pushOk) {
              delivered = await pushText(userId, replyText_);
            } else {
              delivered = true;
            }
          } else {
            delivered = await pushText(userId, replyText_);
          }
        }
      } else {
        if (replyIsFlex) {
          delivered = await pushMessages(userId, reply.messages);
          if (!delivered) delivered = await pushText(userId, replyText_);
        } else {
          delivered = await pushText(userId, replyText_);
        }
      }

      await logMessage(userId, "assistant", replyText_, { delivered, prompt_versions: getPromptVersions() }, delivered, claimed.trace_id ?? undefined);
      await markDone(webhookEventId);
    } catch (e) {
      console.error("[webhook] handle error", e);
      const errorMsg = "ขออภัย มีข้อผิดพลาดชั่วคราว ลองใหม่อีกครั้งนะ";
      let errorDelivered = false;
      if (replyToken) {
        try {
          errorDelivered = await pushText(userId, errorMsg);
        } catch {
          // ignore secondary failure
        }
      }
      await logMessage(userId, "assistant", errorMsg, { delivered: errorDelivered, error: true }, errorDelivered, claimed.trace_id ?? undefined);
      await markFailed(webhookEventId, (e as Error).message);
    }
  } catch (e) {
    console.error("[webhook] processEvent error", e);
    await markFailed(webhookEventId, (e as Error).message);
  }
}

function isCalendarConnectIntent(text: string) {
  return /^(เชื่อม|ลิงค์|link|connect)\s*(google)?\s*(calendar|ปฏิทิน|cal)\b/i.test(text);
}

function isDashboardIntent(text: string) {
  return /^(dashboard|เปิด\s*dashboard|เปิด\s*แดชบอร์ด|เมนู|menu|หน้าหลัก|อับดุล\s*อยู่ไหน|โฮชิ\s*อยู่ไหน|แจ๋ว\s*อยู่ไหน|เปิด\s*แจ๋ว|เปิด\s*อีแจ๋ว)\b/i.test(text);
}
