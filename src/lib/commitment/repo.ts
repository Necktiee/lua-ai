import { requireDb, touchUser } from "@/lib/db/client";

export type Commitment = {
  id: string;
  user_id: string;
  title: string;
  responsible_party: "owner" | "other";
  counterparty: string | null;
  due_at: string | null;
  review_at: string | null;
  status: "open" | "fulfilled" | "cancelled";
  evidence_memory_id: string | null;
  outcome: string | null;
  created_at: string;
  updated_at: string;
};

export async function listOpenCommitments(userId: string): Promise<Commitment[]> {
  const { data, error } = await requireDb()
    .from("commitments")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "open")
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(50);
  if (error) throw new Error(`commitment list: ${error.message}`);
  return (data ?? []) as Commitment[];
}

export async function addCommitment(input: Pick<Commitment, "user_id" | "title" | "responsible_party"> & Partial<Pick<Commitment, "counterparty" | "due_at" | "review_at" | "evidence_memory_id">>): Promise<Commitment> {
  await touchUser(input.user_id);
  const { data, error } = await requireDb().from("commitments").insert(input).select().single();
  if (error) throw new Error(`commitment insert: ${error.message}`);
  return data as Commitment;
}

export async function resolveCommitment(userId: string, id: string, status: "fulfilled" | "cancelled", outcome?: string): Promise<boolean> {
  const { data, error } = await requireDb().from("commitments")
    .update({ status, outcome: outcome?.trim() || null })
    .eq("user_id", userId).eq("id", id).eq("status", "open").select("id").maybeSingle();
  if (error) throw new Error(`commitment resolve: ${error.message}`);
  return Boolean(data);
}

export async function listOverdueCommitments(userId: string, now: Date = new Date()): Promise<Commitment[]> {
  const { data, error } = await requireDb()
    .from("commitments")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "open")
    .not("due_at", "is", null)
    .lt("due_at", now.toISOString())
    .order("due_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(`commitment overdue: ${error.message}`);
  return (data ?? []) as Commitment[];
}

export async function listCommitmentsDueForReview(userId: string, now: Date = new Date()): Promise<Commitment[]> {
  const { data, error } = await requireDb()
    .from("commitments")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "open")
    .not("review_at", "is", null)
    .lte("review_at", now.toISOString())
    .order("review_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(`commitment review-due: ${error.message}`);
  return (data ?? []) as Commitment[];
}
