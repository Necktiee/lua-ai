/**
 * LINE webhook — receive + verify signature + dispatch.
 * ใช้ after() เพื่อ process หลังตอบ 200 ทันที (LINE timeout 1s).
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
import { signOAuthState } from "@/lib/auth/oauth-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.text();

  const sig = req.headers.get("x-line-signature") ?? "";
  const ok = await validateSignature(body, sig);
  if (!ok) return new Response("invalid signature", { status: 401 });

  let payload: {
    events?: Array<{
      type: string;
      replyToken?: string;
      source?: { userId?: string; displayName?: string };
      message?: {
        type: string;
        id: string;
        text?: string;
      };
    }>;
  };
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  // ตอบ 200 ทันที ป้องกัน LINE retry
  after(async () => {
    const events = payload.events ?? [];
    for (const ev of events) {
      if (ev.type !== "message") continue;
      const userId = ev.source?.userId;
      const replyToken = ev.replyToken;
      if (!userId) continue;

      if (
        env.LINE_USER_WHITELIST.length > 0 &&
        !env.LINE_USER_WHITELIST.includes(userId)
      ) {
        continue;
      }

      const text = ev.message?.type === "text" ? (ev.message.text ?? "").trim() : "";
      // Best-effort typing/loading indicator before slow LLM or attachment work.
      // LINE accepts the userId as chatId for 1:1 chats.
      await startLoadingAnimation(userId, 20);

      if (isCalendarConnectIntent(text)) {
        if (!env.APP_BASE_URL) {
          await pushText(
            userId,
            "ยังตั้งค่า APP_BASE_URL ไม่ครบ — ใส่ URL สาธารณะ (เช่น cloudflared tunnel) ใน .env.local ก่อนเชื่อม calendar",
          );
          continue;
        }
        const { canonicalUserId } = await import("@/lib/auth/owner");
        const ownerId = canonicalUserId(userId);
        const state = await signOAuthState(ownerId);
        const url = `${env.APP_BASE_URL.replace(/\/$/, "")}/api/cal/connect?state=${encodeURIComponent(state)}`;
        await pushText(userId, `เปิดลิงก์นี้เพื่อเชื่อม Google Calendar:\n${url}`);
        continue;
      }

      if (isDashboardIntent(text)) {
        if (!env.LIFF_ID) {
          await pushText(userId, "ยังไม่ได้เปิด LIFF dashboard — ตั้งค่า LIFF_ID ก่อน");
          continue;
        }
        await pushText(userId, `เปิด dashboard ของโฮชิได้ที่ลิงก์นี้:\nhttps://liff.line.me/${env.LIFF_ID}`);
        continue;
      }

      let attachment:
        | {
            kind: "image" | "audio" | "file";
            messageId: string;
            contentType: string;
            buffer?: ArrayBuffer;
          }
        | undefined;
      if (ev.message && ["image", "audio", "file"].includes(ev.message.type)) {
        try {
          const fetched = await fetchMessageContent(ev.message.id);
          attachment = {
            kind: ev.message.type as "image" | "audio" | "file",
            messageId: ev.message.id,
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
          displayName: ev.source?.displayName,
          text,
          hasAttachment: Boolean(attachment),
          attachment,
        });
        const replyIsFlex = typeof reply !== "string";
        const replyText_ = replyIsFlex ? reply.text : reply;
        if (replyToken) {
          const delivered = replyIsFlex
            ? await replyMessages(replyToken, reply.messages)
            : await replyText(replyToken, replyText_);
          if (!delivered) {
            console.warn("[webhook] reply failed, falling back to push", userId);
            if (replyIsFlex) {
              // Try Flex push first; if that also fails, fall back to plain text
              // so the user is never left without a response.
              const pushOk = await pushMessages(userId, reply.messages);
              if (!pushOk) {
                await pushText(userId, replyText_);
              }
            } else {
              await pushText(userId, replyText_);
            }
          }
        }
      } catch (e) {
        console.error("[webhook] handle error", e);
        if (replyToken) {
          try {
            await pushText(userId, "ขออภัย มีข้อผิดพลาดชั่วคราว ลองใหม่อีกครั้งนะ");
          } catch {
            // ignore secondary failure
          }
        }
      }
    }
  });

  return new Response("ok", { status: 200 });
}

function isCalendarConnectIntent(text: string) {
  return /^(เชื่อม|ลิงค์|link|connect)\s*(google)?\s*(calendar|ปฏิทิน|cal)\b/i.test(
    text,
  );
}

function isDashboardIntent(text: string) {
  return /^(dashboard|เปิด\s*dashboard|เปิด\s*แดชบอร์ด|เมนู|menu|หน้าหลัก|อับดุล\s*อยู่ไหน|โฮชิ\s*อยู่ไหน)\b/i.test(text);
}
