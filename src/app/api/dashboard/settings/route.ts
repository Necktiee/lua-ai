/**
 * Dashboard: user settings (briefing/evening time, toggles, timezone).
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import { getSettings, updateSettings } from "@/lib/settings/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const IANA_RE = /^[a-zA-Z_]+\/[a-zA-Z_]+(\/[a-zA-Z_]+)?$/;

function validateSettingsField(key: string, value: unknown): string | null {
  switch (key) {
    case "briefing_time":
    case "evening_time":
      if (typeof value !== "string" || !TIME_RE.test(value)) {
        return `${key} must be HH:mm (24h)`;
      }
      return null;
    case "briefing_enabled":
    case "evening_enabled":
    case "auto_journal_enabled":
      if (typeof value !== "boolean") return `${key} must be boolean`;
      return null;
    case "follow_up_nudge_days":
      if (typeof value !== "number" || value < 0 || value > 30 || !Number.isInteger(value)) {
        return `${key} must be an integer 0-30`;
      }
      return null;
    case "retention_days":
      if (typeof value !== "number" || value < 0 || value > 3650 || !Number.isInteger(value)) {
        return `${key} must be an integer 0-3650 (0 = forever)`;
      }
      return null;
    case "quiet_hours_enabled":
      if (typeof value !== "boolean") return `${key} must be boolean`;
      return null;
    case "quiet_hours_start":
    case "quiet_hours_end":
      if (value === null) return null;
      if (typeof value !== "string" || !TIME_RE.test(value)) {
        return `${key} must be HH:mm or null`;
      }
      return null;
    case "timezone":
      if (typeof value !== "string" || !IANA_RE.test(value)) {
        return `${key} must be a valid IANA timezone (e.g. Asia/Bangkok)`;
      }
      return null;
    default:
      return `unknown field: ${key}`;
  }
}

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
    "retention_days",
    "quiet_hours_enabled",
    "quiet_hours_start",
    "quiet_hours_end",
    "timezone",
  ] as const;

  const patch: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const key of allowed) {
    if (key in body) {
      const err = validateSettingsField(key, body[key]);
      if (err) {
        errors.push(err);
      } else {
        patch[key] = body[key];
      }
    }
  }
  if (errors.length > 0) {
    return Response.json({ error: errors.join("; ") }, { status: 400 });
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "no valid fields" }, { status: 400 });
  }

  const settings = await updateSettings(userId, patch);
  return Response.json({ settings });
}
