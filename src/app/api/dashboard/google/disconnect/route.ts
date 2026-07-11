/**
 * Google disconnect — revoke Google OAuth tokens and delete from DB.
 * POST /api/dashboard/google/disconnect
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import { requireDb } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  const db = requireDb();

  // Fetch token before deleting (need refresh_token to revoke)
  const { data: token } = await db
    .from("google_tokens")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();

  // Revoke the refresh token with Google (best-effort)
  if (token?.refresh_token) {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `token=${encodeURIComponent(token.refresh_token)}`,
      });
    } catch (e) {
      console.warn("[google-disconnect] revoke failed", (e as Error).message);
    }
  }

  // Delete the token row
  const { error } = await db.from("google_tokens").delete().eq("user_id", userId);
  if (error) {
    return Response.json({ error: "disconnect failed" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
