/**
 * Dashboard: active goals with current-period progress.
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import { getGoals, getProgressMapForGoals, deleteGoal, addGoal } from "@/lib/goal/repo";
import { getSettings } from "@/lib/settings/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  const [goals, settings] = await Promise.all([getGoals(userId), getSettings(userId)]);
  const progress = await getProgressMapForGoals(goals, settings.timezone);

  return Response.json({
    goals: goals.map((g) => ({ ...g, current_value: progress.get(g.id) ?? g.current_value })),
  });
}

export async function POST(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  let body: { title?: unknown; targetValue?: unknown; unit?: unknown; period?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.title !== "string" || !body.title.trim()) {
    return Response.json({ error: "title required" }, { status: 400 });
  }
  const period = body.period === "weekly" || body.period === "monthly" ? body.period : "daily";
  const target = typeof body.targetValue === "number" ? body.targetValue : null;
  const goal = await addGoal({
    userId,
    title: body.title.trim(),
    targetValue: target ?? undefined,
    unit: typeof body.unit === "string" ? body.unit : undefined,
    period,
  });
  return Response.json({ goal });
}

export async function DELETE(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const ok = await deleteGoal(userId, id);
  if (!ok) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok });
}

