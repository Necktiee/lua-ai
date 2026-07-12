import { requireSessionUser } from "@/lib/auth/require-session";
import { decideWeeklyPlan, getCurrentPlan, listWeeklyPlans, upsertWeeklyPlan } from "@/lib/weekly-plan/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isoWeekStart(d = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0 Sun … 6 Sat
  const diff = (day === 0 ? -6 : 1) - day; // Monday as week start
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const url = new URL(req.url);
  const week = url.searchParams.get("week");
  if (week) {
    const plan = await getCurrentPlan(userId, week);
    return Response.json({ plan });
  }
  const plans = await listWeeklyPlans(userId);
  return Response.json({ plans, currentWeek: isoWeekStart() });
}

export async function POST(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const weekStart =
    typeof body?.weekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.weekStart)
      ? body.weekStart
      : isoWeekStart();
  if (!body || typeof body.reflection !== "string" && !Array.isArray(body.priorities)) {
    return Response.json({ error: "reflection or priorities required" }, { status: 400 });
  }
  const plan = await upsertWeeklyPlan({
    user_id: userId,
    week_start: weekStart,
    reflection: typeof body.reflection === "string" ? body.reflection.trim() || null : undefined,
    proposed_priorities: Array.isArray(body.priorities) ? body.priorities : undefined,
    carried_over: Array.isArray(body.carriedOver) ? body.carriedOver : undefined,
    status: "proposed",
  });
  return Response.json({ plan }, { status: 201 });
}

export async function PATCH(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.id !== "string" ||
    (body.status !== "approved" && body.status !== "rejected")
  ) {
    return Response.json({ error: "id and status (approved|rejected) required" }, { status: 400 });
  }
  const ok = await decideWeeklyPlan(userId, body.id, body.status);
  return ok ? Response.json({ ok: true }) : Response.json({ error: "not found" }, { status: 404 });
}
