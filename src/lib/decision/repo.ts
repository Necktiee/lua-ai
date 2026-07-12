import { requireDb, touchUser } from "@/lib/db/client";

export type Decision = { id: string; user_id: string; title: string; options: string[]; rationale: string | null; assumptions: string[]; evidence_memory_id: string | null; review_at: string | null; outcome: string | null; status: "open" | "reviewed" | "superseded"; created_at: string; updated_at: string };

export async function listDecisionsDueForReview(userId: string): Promise<Decision[]> {
  const { data, error } = await requireDb().from("decisions").select("*").eq("user_id", userId).eq("status", "open").not("review_at", "is", null).lte("review_at", new Date().toISOString()).order("review_at").limit(50);
  if (error) throw new Error(`decision list: ${error.message}`);
  return (data ?? []) as Decision[];
}

export async function listOpenDecisions(userId: string): Promise<Decision[]> {
  const { data, error } = await requireDb()
    .from("decisions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`decision list open: ${error.message}`);
  return (data ?? []) as Decision[];
}

export async function addDecision(input: Pick<Decision, "user_id" | "title"> & Partial<Pick<Decision, "options" | "rationale" | "assumptions" | "evidence_memory_id" | "review_at">>): Promise<Decision> {
  await touchUser(input.user_id);
  const { data, error } = await requireDb().from("decisions").insert(input).select().single();
  if (error) throw new Error(`decision insert: ${error.message}`);
  return data as Decision;
}

export async function reviewDecision(
  userId: string,
  id: string,
  outcome: string,
  status: "reviewed" | "superseded" = "reviewed",
): Promise<boolean> {
  const trimmed = outcome.trim();
  if (!trimmed) throw new Error("reviewDecision: outcome required");
  const { data, error } = await requireDb()
    .from("decisions")
    .update({ status, outcome: trimmed })
    .eq("user_id", userId)
    .eq("id", id)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`decision review: ${error.message}`);
  return Boolean(data);
}
