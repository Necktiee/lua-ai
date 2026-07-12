import { requireSessionUser } from "@/lib/auth/require-session";
import { listOperatingRhythm, supersedePattern, type RhythmPatternType } from "@/lib/rhythm/repo";

const PATTERN_TYPES = new Set<RhythmPatternType>([
  "working_hours",
  "energy_peak",
  "energy_low",
  "briefing_format",
  "routine",
  "preferred_channel",
  "response_window",
  "other",
]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const url = new URL(req.url);
  const minParam = Number(url.searchParams.get("minConfidence"));
  const minConfidence = Number.isFinite(minParam) && minParam >= 0 && minParam <= 1 ? minParam : 0.6;
  const patterns = await listOperatingRhythm(userId, minConfidence);
  return Response.json({ patterns });
}

export async function DELETE(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const url = new URL(req.url);
  const patternType = url.searchParams.get("patternType");
  const patternKey = url.searchParams.get("patternKey");
  if (
    !patternType ||
    !patternKey ||
    !PATTERN_TYPES.has(patternType as RhythmPatternType)
  ) {
    return Response.json({ error: "valid patternType and patternKey required" }, { status: 400 });
  }
  const ok = await supersedePattern(userId, patternType, patternKey);
  return ok ? Response.json({ ok: true }) : Response.json({ error: "not found" }, { status: 404 });
}
