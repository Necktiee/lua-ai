/**
 * Shared guard for /api/dashboard/* routes — reads session cookie, checks whitelist.
 * If OWNER_LINE_USER_ID is set, returns the canonical owner so all dashboard data
 * unifies under one user regardless of which whitelisted LINE account logged in.
 * Usage: const userId = await requireSessionUser(); if (userId instanceof Response) return userId;
 */
import { getSessionUserId } from "@/lib/auth/session";
import { isUserAllowed } from "@/lib/auth/whitelist";
import { canonicalUserId } from "@/lib/auth/owner";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { headers } from "next/headers";

const DASHBOARD_RATE_LIMIT = 120;
const DASHBOARD_RATE_WINDOW = 60;

export async function requireSessionUser(): Promise<string | Response> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const rl = await rateLimit(`dash:${ip}`, DASHBOARD_RATE_LIMIT, DASHBOARD_RATE_WINDOW);
  if (!rl.success) return rateLimitResponse(rl);

  const userId = await getSessionUserId();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isUserAllowed(userId)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  return canonicalUserId(userId);
}
