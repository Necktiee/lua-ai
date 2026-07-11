/**
 * Signed OAuth state — binds Google OAuth flow to LINE userId.
 *
 * Phase 3: state is now one-time-use via a server-stored nonce.
 * signOAuthState generates a random nonce, stores its hash in oauth_nonces.
 * verifyOAuthState consumes the nonce (delete by hash) — if no row was
 * deleted, the state was already used or invalid.
 *
 * state format: base64url(userId|exp|source|nonce).base64url(hmac-sha256)
 */
import { env } from "@/lib/env";
import { requireDb } from "@/lib/db/client";

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

export type OAuthStateSource = "chat" | "liff";

function encodePayload(userId: string, source: OAuthStateSource, nonce: string): string {
  const exp = Date.now() + STATE_TTL_MS;
  return `${userId}|${exp}|${source}|${nonce}`;
}

function decodePayload(raw: string): { userId: string; exp: number; source: OAuthStateSource; nonce: string } | null {
  const parts = raw.split("|");
  if (parts.length < 3) return null;
  const userId = parts[0];
  const exp = Number(parts[1]);
  const source: OAuthStateSource = parts[2] === "liff" ? "liff" : "chat";
  const nonce = parts[3] ?? "";
  if (!userId || !Number.isFinite(exp) || !nonce) return null;
  return { userId, exp, source, nonce };
}

async function hashNonce(nonce: string): Promise<string> {
  const data = new TextEncoder().encode(nonce);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Create a signed OAuth state with a one-time nonce.
 * The nonce is stored server-side; it can only be used once.
 */
export async function signOAuthState(userId: string, source: OAuthStateSource = "chat"): Promise<string> {
  const nonce = crypto.randomUUID() + crypto.randomUUID();
  const nonceHash = await hashNonce(nonce);
  const exp = Date.now() + STATE_TTL_MS;

  const db = requireDb();
  await db.from("oauth_nonces").insert({
    nonce_hash: nonceHash,
    user_id: userId,
    source,
    expires_at: new Date(exp).toISOString(),
  });

  const payload = encodePayload(userId, source, nonce);
  const sig = await hmac(payload);
  return `${btoa(payload).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.${sig}`;
}

/**
 * Verify a signed OAuth state AND consume its one-time nonce.
 * Returns null if the state is invalid, expired, or already consumed.
 */
export async function verifyOAuthState(
  state: string,
): Promise<{ userId: string; source: OAuthStateSource } | null> {
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

  // Consume the one-time nonce
  const nonceHash = await hashNonce(parsed.nonce);
  const db = requireDb();
  const { data, error } = await db
    .from("oauth_nonces")
    .delete()
    .eq("nonce_hash", nonceHash)
    .eq("user_id", parsed.userId)
    .select("id")
    .maybeSingle();
  if (error) {
    console.warn("[oauth-state] nonce consume", error.message);
    return null;
  }
  if (!data) return null;

  return { userId: parsed.userId, source: parsed.source };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
