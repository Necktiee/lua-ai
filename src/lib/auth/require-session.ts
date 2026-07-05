/**
 * Shared guard for /api/dashboard/* routes — reads session cookie, checks whitelist.
 * Usage: const userId = await requireSessionUser(); if (userId instanceof Response) return userId;
 */
import { getSessionUserId } from "@/lib/auth/session";
import { isUserAllowed } from "@/lib/auth/whitelist";

export async function requireSessionUser(): Promise<string | Response> {
  const userId = await getSessionUserId();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isUserAllowed(userId)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  return userId;
}
