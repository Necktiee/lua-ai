/**
 * LIFF login verify — รับ id_token จาก liff.getIDToken() ฝั่ง client,
 * ยืนยันกับ LINE แล้วออก session cookie (hoshi_session).
 *
 * userId (sub) จาก LINE Login channel นี้ = userId เดียวกับที่ใช้ใน Messaging API
 * channel เพราะสร้างใต้ provider เดียวกัน — ใช้ query ตาราง users/todos/etc ได้ตรงๆ
 */
import { touchUser } from "@/lib/db/client";
import { isUserAllowed } from "@/lib/auth/whitelist";
import { signSession, SESSION_COOKIE } from "@/lib/auth/session";
import { env, hasLiff } from "@/lib/env";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface VerifyResponse {
  sub?: string;
  name?: string;
  error?: string;
  error_description?: string;
}

export async function POST(req: Request) {
  if (!hasLiff()) {
    return Response.json({ error: "LIFF not configured" }, { status: 503 });
  }

  let body: { idToken?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const idToken = body.idToken;
  if (!idToken || typeof idToken !== "string") {
    return Response.json({ error: "missing idToken" }, { status: 400 });
  }

  let verified: VerifyResponse;
  try {
    const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        id_token: idToken,
        client_id: env.LIFF_CHANNEL_ID!,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    verified = await res.json();
    if (!res.ok || verified.error) {
      console.warn("[liff/verify] LINE rejected token", verified.error, verified.error_description);
      return Response.json({ error: "invalid token" }, { status: 401 });
    }
  } catch (e) {
    console.error("[liff/verify] verify call failed", (e as Error).message);
    return Response.json({ error: "verify failed" }, { status: 502 });
  }

  const userId = verified.sub;
  if (!userId || !/^U[0-9a-f]{32}$/i.test(userId)) {
    return Response.json({ error: "invalid userId" }, { status: 401 });
  }
  if (!isUserAllowed(userId)) {
    return Response.json({ error: "user not allowed" }, { status: 403 });
  }

  await touchUser(userId, verified.name);

  const token = await signSession(userId);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });

  return Response.json({ ok: true, userId });
}
