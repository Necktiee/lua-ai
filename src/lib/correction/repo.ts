import { requireDb, touchUser } from "@/lib/db/client";

export type CorrectionType = "rewrite" | "reject" | "refine" | "confirm";
export type CorrectionFeature =
  | "memory_summary"
  | "reminder"
  | "commitment"
  | "decision"
  | "meeting"
  | "planning"
  | "retrieval"
  | "translation"
  | "tone"
  | "other";

export type Correction = {
  id: string;
  user_id: string;
  feature: CorrectionFeature;
  original_output: string;
  corrected_output: string;
  correction_type: CorrectionType;
  source_memory_id: string | null;
  applied: boolean;
  created_at: string;
  updated_at: string;
};

export async function listRecentCorrections(
  userId: string,
  limit = 50,
): Promise<Correction[]> {
  const { data, error } = await requireDb()
    .from("corrections")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`corrections list: ${error.message}`);
  return (data ?? []) as Correction[];
}

export async function recordCorrection(
  input: Pick<Correction, "user_id" | "feature" | "original_output" | "corrected_output"> &
    Partial<Pick<Correction, "correction_type" | "source_memory_id" | "applied">>,
): Promise<Correction> {
  await touchUser(input.user_id);
  const { data, error } = await requireDb()
    .from("corrections")
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(`correction insert: ${error.message}`);
  return data as Correction;
}

export async function countCorrectionsByFeature(
  userId: string,
): Promise<Record<string, number>> {
  const { data, error } = await requireDb()
    .rpc("count_corrections_by_feature", { p_user_id: userId });
  if (error) throw new Error(`correction counts: ${error.message}`);
  const out: Record<string, number> = {};
  for (const row of (data as Array<{ feature: string; n: number }>) ?? []) {
    out[row.feature] = row.n;
  }
  return out;
}
