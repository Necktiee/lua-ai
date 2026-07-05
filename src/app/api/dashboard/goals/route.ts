/**
 * Dashboard: active goals with current-period progress.
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import { getGoals, getProgressMapForGoals } from "@/lib/goal/repo";
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
