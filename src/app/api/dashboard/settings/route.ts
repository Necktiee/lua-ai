/**
 * Dashboard: user settings (briefing/evening time, toggles, timezone).
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import { getSettings, updateSettings } from "@/lib/settings/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const settings = await getSettings(userId);
  return Response.json({ settings });
}

export async function PATCH(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const allowed = [
    "briefing_time",
    "evening_time",
    "briefing_enabled",
    "evening_enabled",
    "auto_journal_enabled",
    "follow_up_nudge_days",
    "timezone",
  ] as const;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "no valid fields" }, { status: 400 });
  }

  const settings = await updateSettings(userId, patch);
  return Response.json({ settings });
}
