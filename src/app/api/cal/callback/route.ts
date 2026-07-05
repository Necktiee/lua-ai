/**
 * Google OAuth callback — รับ code แล้วเก็บ token ลง DB.
 */
import { exchangeCode, saveTokens } from "@/lib/calendar/events";
import { verifyOAuthState } from "@/lib/auth/oauth-state";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return new Response(`OAuth error: ${error}`, { status: 400 });
  }
  if (!code || !state) {
    return new Response("missing code or state", { status: 400 });
  }

  const userId = await verifyOAuthState(state);
  if (!userId || !/^U[0-9a-f]{32}$/i.test(userId)) {
    return new Response("invalid state", { status: 400 });
  }
  if (env.LINE_USER_WHITELIST.length > 0 && !env.LINE_USER_WHITELIST.includes(userId)) {
    return new Response("user not allowed", { status: 403 });
  }

  try {
    const tokens = await exchangeCode(code);
    await saveTokens(userId, tokens);
    return new Response("เชื่อม Google Calendar สำเร็จ ✅ ปิดหน้านี้ได้เลย", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  } catch (e) {
    console.error("[cal/callback]", e);
    return new Response("เชื่อมไม่สำเร็จ ลองใหม่อีกครั้ง", { status: 500 });
  }
}
