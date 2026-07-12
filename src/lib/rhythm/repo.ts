import { requireDb, touchUser } from "@/lib/db/client";

export type RhythmPatternType =
  | "working_hours"
  | "energy_peak"
  | "energy_low"
  | "briefing_format"
  | "routine"
  | "preferred_channel"
  | "response_window"
  | "other";

export type OperatingRhythm = {
  id: string;
  user_id: string;
  pattern_type: RhythmPatternType;
  pattern_key: string;
  pattern_value: unknown;
  confidence: number;
  observed_count: number;
  last_observed_at: string | null;
  superseded: boolean;
  created_at: string;
  updated_at: string;
};

export async function listOperatingRhythm(
  userId: string,
  minConfidence = 0.6,
  limit = 50,
): Promise<OperatingRhythm[]> {
  const { data, error } = await requireDb()
    .from("operating_rhythm")
    .select("*")
    .eq("user_id", userId)
    .eq("superseded", false)
    .gte("confidence", minConfidence)
    .order("observed_count", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`operating_rhythm list: ${error.message}`);
  return (data ?? []) as OperatingRhythm[];
}

export async function observePattern(
  input: Pick<OperatingRhythm, "user_id" | "pattern_type" | "pattern_key"> &
    Partial<Pick<OperatingRhythm, "pattern_value">>,
): Promise<OperatingRhythm> {
  await touchUser(input.user_id);
  const now = new Date().toISOString();
  const { data, error } = await requireDb()
    .rpc("upsert_operating_rhythm_observation", {
      p_user_id: input.user_id,
      p_pattern_type: input.pattern_type,
      p_pattern_key: input.pattern_key,
      p_pattern_value: JSON.stringify(input.pattern_value ?? null),
      p_observed_at: now,
    });
  if (error) throw new Error(`operating_rhythm observe: ${error.message}`);
  return data as unknown as OperatingRhythm;
}

export async function supersedePattern(
  userId: string,
  patternType: string,
  patternKey: string,
): Promise<boolean> {
  const { data, error } = await requireDb()
    .from("operating_rhythm")
    .update({ superseded: true })
    .eq("user_id", userId)
    .eq("pattern_type", patternType)
    .eq("pattern_key", patternKey)
    .eq("superseded", false)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`operating_rhythm supersede: ${error.message}`);
  return Boolean(data);
}
