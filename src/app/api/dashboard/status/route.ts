/**
 * Dashboard: system/API status + Google connection status for the logged-in user.
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import { hasLine, hasSupabase, hasQStash, hasGoogleCalendar, hasWebSearch, hasLiff } from "@/lib/env";
import { requireDb } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  let googleConnected = false;
  let googleScope: string | null = null;
  try {
    const db = requireDb();
    const { data } = await db
      .from("google_tokens")
      .select("scope, refresh_token")
      .eq("user_id", userId)
      .maybeSingle();
    googleConnected = Boolean(data?.refresh_token);
    googleScope = data?.scope ?? null;
  } catch {
    // ignore — surfaced as not connected
  }

  return Response.json({
    status: {
      hasLine: hasLine(),
      hasSupabase: hasSupabase(),
      hasQStash: hasQStash(),
      hasGoogleCalendar: hasGoogleCalendar(),
      hasWebSearch: hasWebSearch(),
      hasLiff: hasLiff(),
    },
    google: {
      connected: googleConnected,
      scope: googleScope,
      hasCalendar: googleScope?.includes("calendar") ?? false,
      hasGmail: googleScope?.includes("gmail") ?? false,
    },
  });
}
