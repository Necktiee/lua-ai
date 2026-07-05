/**
 * Signed OAuth state — binds Google OAuth flow to LINE userId.
 * state format: base64url(userId).base64url(hmac-sha256)
 */
import { env } from "@/lib/env";

function secret(): string {
  const s = env.LINE_CHANNEL_SECRET || env.CRON_SECRET;
  if (!s) {
    throw new Error("OAuth state secret missing — set LINE_CHANNEL_SECRET or CRON_SECRET");
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

const STATE_TTL_MS = 10 * 60 * 1000;

function encodePayload(userId: string): string {
  const exp = Date.now() + STATE_TTL_MS;
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

export async function signOAuthState(userId: string): Promise<string> {
  const payload = encodePayload(userId);
  const sig = await hmac(payload);
  return `${btoa(payload).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.${sig}`;
}

export async function verifyOAuthState(state: string): Promise<string | null> {
  const dot = state.lastIndexOf(".");
  if (dot < 1) return null;
  const payloadB64 = state.slice(0, dot);
  const sig = state.slice(dot + 1);
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
