import { requireDb, touchUser } from "@/lib/db/client";

export type FocusWindow = {
  id: string;
  user_id: string;
  label: string;
  day_of_week: number;
  start_minute: number;
  end_minute: number;
  priority_threshold: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export async function listFocusWindows(userId: string): Promise<FocusWindow[]> {
  const { data, error } = await requireDb()
    .from("focus_windows")
    .select("*")
    .eq("user_id", userId)
    .order("day_of_week", { ascending: true })
    .order("start_minute", { ascending: true });
  if (error) throw new Error(`focus_windows list: ${error.message}`);
  return (data ?? []) as FocusWindow[];
}

export async function isFocusBlocked(userId: string, when: Date = new Date()): Promise<boolean> {
  const day = when.getDay();
  const minutes = when.getHours() * 60 + when.getMinutes();
  const { count, error } = await requireDb()
    .from("focus_windows")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("enabled", true)
    .eq("day_of_week", day)
    .lte("start_minute", minutes)
    .gt("end_minute", minutes);
  if (error) throw new Error(`focus check: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function addFocusWindow(
  input: Pick<FocusWindow, "user_id" | "day_of_week" | "start_minute" | "end_minute"> &
    Partial<Pick<FocusWindow, "label" | "priority_threshold" | "enabled">>,
): Promise<FocusWindow> {
  await touchUser(input.user_id);
  const { data, error } = await requireDb()
    .from("focus_windows")
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(`focus_window insert: ${error.message}`);
  return data as FocusWindow;
}

export async function setFocusWindowEnabled(
  userId: string,
  id: string,
  enabled: boolean,
): Promise<boolean> {
  const { data, error } = await requireDb()
    .from("focus_windows")
    .update({ enabled })
    .eq("user_id", userId)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`focus_window update: ${error.message}`);
  return Boolean(data);
}
