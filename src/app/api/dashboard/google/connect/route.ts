/**
 * Dashboard: start Google OAuth flow from LIFF session (instead of LINE-chat text command).
 * Signs OAuth state from the session cookie's userId, source="liff" so callback redirects back to /liff.
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import { getAuthUrl } from "@/lib/calendar/events";
import { signOAuthState } from "@/lib/auth/oauth-state";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  if (!env.APP_BASE_URL) {
    return Response.json({ error: "APP_BASE_URL not configured" }, { status: 503 });
  }

  const state = await signOAuthState(userId, "liff");
  const authUrl = getAuthUrl(state);
  return Response.redirect(authUrl, 302);
}
