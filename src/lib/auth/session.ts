/**
 * Signed session cookie — persists LIFF/dashboard login (30 วัน).
 * รูปแบบเดียวกับ oauth-state.ts แต่ TTL ยาวกว่า เพราะเป็น session จริง ไม่ใช่ one-time flow.
 * state format: base64url(userId|expiry).base64url(hmac-sha256)
 */
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "hoshi_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 วัน

function secret(): string {
  const s = env.SESSION_SECRET || env.LINE_CHANNEL_SECRET || env.CRON_SECRET;
  if (!s) {
    throw new Error("Session secret missing — set SESSION_SECRET หรือ LINE_CHANNEL_SECRET");
  }
  return s;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodePayload(userId: string): string {
  const exp = Date.now() + SESSION_TTL_MS;
  return `${userId}|${exp}`;
}

function decodePayload(raw: string): { userId: string; exp: number } | null {
  const pipe = raw.lastIndexOf("|");
  if (pipe < 1) return null;
  const userId = raw.slice(0, pipe);
  const exp = Number(raw.slice(pipe + 1));
  if (!userId || !Number.isFinite(exp)) return null;
  return { userId, exp };
}

export async function signSession(userId: string): Promise<string> {
  const payload = encodePayload(userId);
  const sig = await hmac(payload);
  const payloadB64 = btoa(payload).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${payloadB64}.${sig}`;
}

export async function verifySession(token: string): Promise<string | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let raw: string;
  try {
    raw = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return null;
  }
  const expected = await hmac(raw);
  if (!timingSafeEqual(sig, expected)) return null;
  const parsed = decodePayload(raw);
  if (!parsed || parsed.exp < Date.now()) return null;
  return parsed.userId;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** อ่าน userId จาก session cookie ของ request ปัจจุบัน (เรียกใน Route Handler / Server Component เท่านั้น) */
export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** ล้าง session cookie (logout) */
export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
