/**
 * Goal repo — Goal Tracking (feature #14).
 */
import { requireDb, touchUser } from "@/lib/db/client";
import { BANGKOK, bangkokDayBounds, localDayBounds, localMonthStartISO, localWeekStartISO } from "@/lib/tz";
import type { Goal, GoalLog } from "@/lib/types";

export async function addGoal(args: {
  userId: string;
  title: string;
  targetValue?: number;
  unit?: string;
  period: "daily" | "weekly" | "monthly";
  deadline?: string;
}): Promise<Goal> {
  const db = requireDb();
  await touchUser(args.userId);
  const { data, error } = await db
    .from("goals")
    .insert({
      user_id: args.userId,
      title: args.title,
      target_value: args.targetValue ?? null,
      unit: args.unit ?? null,
      period: args.period,
      deadline: args.deadline ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`goal insert: ${error.message}`);
  return data as Goal;
}

export async function getGoals(userId: string, status = "active"): Promise<Goal[]> {
  const db = requireDb();
  const { data, error } = await db
    .from("goals")
    .select("*")
    .eq("user_id", userId)
    .eq("status", status)
    .order("created_at", { ascending: false });
  if (error) console.warn("[goal] list", error.message);
  return (data ?? []) as Goal[];
}

export async function logGoalProgress(args: {
  userId: string;
  goalId: string;
  value: number;
  note?: string;
}): Promise<GoalLog> {
  const db = requireDb();
  const { data, error } = await db
    .from("goal_logs")
    .insert({
      goal_id: args.goalId,
      user_id: args.userId,
      value: args.value,
      note: args.note ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`goal_log insert: ${error.message}`);

  const { getSettings } = await import("@/lib/settings/repo");
  const settings = await getSettings(args.userId);
  await refreshGoalCurrent(args.goalId, settings.timezone);
  return data as GoalLog;
}

export async function getProgressThisPeriod(goal: Goal, timeZone = BANGKOK): Promise<number> {
  const map = await getProgressMapForGoals([goal], timeZone);
  return map.get(goal.id) ?? goal.current_value ?? 0;
}

/** Batch progress for multiple goals (one query per period bucket). */
export async function getProgressMapForGoals(goals: Goal[], timeZone = BANGKOK): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (goals.length === 0) return result;

  const db = requireDb();
  const now = new Date();
  const dayStart = timeZone === BANGKOK ? bangkokDayBounds(now).start : localDayBounds(now, timeZone).start;
  const periodStart: Record<string, string> = {
    daily: dayStart,
    weekly: localWeekStartISO(now, timeZone),
    monthly: localMonthStartISO(now, timeZone),
  };

  const byPeriod = new Map<string, Goal[]>();
  for (const g of goals) {
    const list = byPeriod.get(g.period) ?? [];
    list.push(g);
    byPeriod.set(g.period, list);
  }

  for (const [period, group] of byPeriod) {
    const startIso = periodStart[period] ?? dayStart;
    const ids = group.map((g) => g.id);
    const { data, error } = await db
      .from("goal_logs")
      .select("goal_id, value")
      .in("goal_id", ids)
      .gte("logged_at", startIso);
    if (error) {
      console.warn("[goal] batch progress", error.message);
      for (const g of group) result.set(g.id, g.current_value ?? 0);
      continue;
    }
    const sums = new Map<string, number>();
    for (const row of data ?? []) {
      const id = row.goal_id as string;
      sums.set(id, (sums.get(id) ?? 0) + Number(row.value));
    }
    for (const g of group) {
      result.set(g.id, sums.get(g.id) ?? 0);
    }
  }
  return result;
}

async function refreshGoalCurrent(goalId: string, timeZone = BANGKOK): Promise<void> {
  const db = requireDb();
  const { data: goal } = await db.from("goals").select("*").eq("id", goalId).single();
  if (!goal) return;
  const progress = await getProgressThisPeriod(goal as Goal, timeZone);
  await db.from("goals").update({ current_value: progress }).eq("id", goalId);
}
