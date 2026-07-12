import { requireDb, touchUser } from "@/lib/db/client";

export type WeeklyPlanStatus = "draft" | "proposed" | "approved" | "rejected" | "superseded";

export type WeeklyPlan = {
  id: string;
  user_id: string;
  week_start: string;
  reflection: string | null;
  proposed_priorities: unknown[];
  carried_over: unknown[];
  status: WeeklyPlanStatus;
  decided_at: string | null;
  source_memory_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function listWeeklyPlans(userId: string, limit = 20): Promise<WeeklyPlan[]> {
  const { data, error } = await requireDb()
    .from("weekly_plans")
    .select("*")
    .eq("user_id", userId)
    .order("week_start", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`weekly_plans list: ${error.message}`);
  return (data ?? []) as WeeklyPlan[];
}

export async function getCurrentPlan(userId: string, weekStart: string): Promise<WeeklyPlan | null> {
  const { data, error } = await requireDb()
    .from("weekly_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw new Error(`weekly_plan get: ${error.message}`);
  return (data as WeeklyPlan) ?? null;
}

export async function upsertWeeklyPlan(
  input: Pick<WeeklyPlan, "user_id" | "week_start"> &
    Partial<Pick<WeeklyPlan, "reflection" | "proposed_priorities" | "carried_over" | "status" | "source_memory_id">>,
): Promise<WeeklyPlan> {
  await touchUser(input.user_id);
  const { data, error } = await requireDb()
    .from("weekly_plans")
    .upsert(input, { onConflict: "user_id,week_start" })
    .select()
    .single();
  if (error) throw new Error(`weekly_plan upsert: ${error.message}`);
  return data as WeeklyPlan;
}

export async function decideWeeklyPlan(
  userId: string,
  id: string,
  status: "approved" | "rejected",
): Promise<boolean> {
  const { data, error } = await requireDb()
    .from("weekly_plans")
    .update({ status, decided_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id)
    .in("status", ["proposed", "draft"])
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`weekly_plan decide: ${error.message}`);
  return Boolean(data);
}
