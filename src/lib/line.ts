/**
 * LINE Messaging API helpers.
 * - validateSignature สำหรับ webhook
 * - reply/push text และ fetch content (image/audio/file)
 *
 * ใช้ Web Crypto (universal ทั้ง Node 18+ runtime และ Edge).
 */
import { env, hasLine } from "@/lib/env";

const API = "https://api.line.me/v2/bot";

const DEFAULT_TIMEOUT_MS = 30_000;

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(t) };
}

export async function validateSignature(
  body: string,
  signature: string,
): Promise<boolean> {
  if (!env.LINE_CHANNEL_SECRET) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.LINE_CHANNEL_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  const expected = b64(sig);
  return secureEqual(expected, signature);
}

export async function replyText(replyToken: string, text: string): Promise<boolean> {
  if (!hasLine()) {
    console.warn("[line] reply skipped — no token");
    return false;
  }
  const { signal, cancel } = withTimeout(DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${API}/message/reply`, {
      method: "POST",
      headers: lineHeaders(),
      body: JSON.stringify({
        replyToken,
        messages: [{ type: "text", text: text.slice(0, 5000) }],
      }),
      signal,
    });
    if (!res.ok) {
      console.warn(`[line] reply failed: ${res.status} ${await res.text().catch(() => "")}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[line] reply error", (e as Error).message);
    return false;
  } finally {
    cancel();
  }
}

export async function pushText(userId: string, text: string): Promise<boolean> {
  if (!hasLine()) {
    console.warn("[line] push skipped — no token");
    return false;
  }
  const { signal, cancel } = withTimeout(DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${API}/message/push`, {
      method: "POST",
      headers: lineHeaders(),
      body: JSON.stringify({
        to: userId,
        messages: [{ type: "text", text: text.slice(0, 5000) }],
      }),
      signal,
    });
    if (!res.ok) {
      console.warn(`[line] push failed: ${res.status} ${await res.text().catch(() => "")}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[line] push error", (e as Error).message);
    return false;
  } finally {
    cancel();
  }
}

/** Show LINE loading animation (typing-like indicator) in 1:1 chat before replying. */
export async function startLoadingAnimation(chatId: string, loadingSeconds = 20): Promise<boolean> {
  if (!hasLine()) {
    console.warn("[line] loading skipped — no token");
    return false;
  }
  const seconds = normalizeLoadingSeconds(loadingSeconds);
  const { signal, cancel } = withTimeout(5_000);
  try {
    const res = await fetch(`${API}/chat/loading/start`, {
      method: "POST",
      headers: lineHeaders(),
      body: JSON.stringify({ chatId, loadingSeconds: seconds }),
      signal,
    });
    if (!res.ok) {
      console.warn(`[line] loading failed: ${res.status} ${await res.text().catch(() => "")}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[line] loading error", (e as Error).message);
    return false;
  } finally {
    cancel();
  }
}

function normalizeLoadingSeconds(seconds: number): 5 | 10 | 15 | 20 | 30 | 60 {
  if (seconds <= 5) return 5;
  if (seconds <= 10) return 10;
  if (seconds <= 15) return 15;
  if (seconds <= 20) return 20;
  if (seconds <= 30) return 30;
  return 60;
}

/** โหลด content ของ message (image/audio/file/video) เป็น ArrayBuffer */
export async function fetchMessageContent(messageId: string): Promise<{ buf: ArrayBuffer; contentType: string }> {
  const { signal, cancel } = withTimeout(DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API}/message/${messageId}/content`, {
      headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
      signal,
    });
  } finally {
    cancel();
  }
  if (!res.ok) {
    throw new Error(`content fetch failed: ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  return { buf, contentType };
}

function lineHeaders() {
  return {
    Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function b64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function secureEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
