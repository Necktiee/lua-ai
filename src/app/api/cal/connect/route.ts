/**
 * Start Google OAuth flow.
 * /api/cal/connect?state=<signed-state>
 */
import { env } from "@/lib/env";
import { getAuthUrl } from "@/lib/calendar/events";
import { verifyOAuthState } from "@/lib/auth/oauth-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const signedState = url.searchParams.get("state");
  if (!signedState) return new Response("missing state", { status: 400 });

  const parsed = await verifyOAuthState(signedState);
  const userId = parsed?.userId;
  if (!userId || !/^U[0-9a-f]{32}$/i.test(userId)) {
    return new Response("invalid state", { status: 400 });
  }

  if (
    env.LINE_USER_WHITELIST.length > 0 &&
    !env.LINE_USER_WHITELIST.includes(userId)
  ) {
    return new Response("forbidden", { status: 403 });
  }
  const authUrl = getAuthUrl(signedState);
  return Response.redirect(authUrl, 302);
}
