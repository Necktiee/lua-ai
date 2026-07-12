import { requireDb, touchUser } from "@/lib/db/client";

export type RelationshipSignal = {
  id: string;
  user_id: string;
  person_id: string;
  last_interaction_at: string | null;
  open_commitments: number;
  suggested_check_in_days: number | null;
  last_suggested_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export async function listRelationshipSignals(userId: string, limit = 50): Promise<
  Array<RelationshipSignal & { person_name?: string | null; person_tier?: number | null }>
> {
  const { data, error } = await requireDb()
    .from("relationship_signals")
    .select("*, people:person_id(name,tier)")
    .eq("user_id", userId)
    .order("last_interaction_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`relationship_signals list: ${error.message}`);
  return (data ?? []).map((row) => {
    const person = (row as { people?: { name?: string | null; tier?: number | null } }).people;
    return {
      id: row.id,
      user_id: row.user_id,
      person_id: row.person_id,
      last_interaction_at: row.last_interaction_at,
      open_commitments: row.open_commitments,
      suggested_check_in_days: row.suggested_check_in_days,
      last_suggested_at: row.last_suggested_at,
      note: row.note,
      created_at: row.created_at,
      updated_at: row.updated_at,
      person_name: person?.name ?? null,
      person_tier: person?.tier ?? null,
    };
  });
}

export async function upsertRelationshipSignal(
  input: Pick<RelationshipSignal, "user_id" | "person_id"> &
    Partial<
      Pick<
        RelationshipSignal,
        | "last_interaction_at"
        | "open_commitments"
        | "suggested_check_in_days"
        | "last_suggested_at"
        | "note"
      >
    >,
): Promise<RelationshipSignal> {
  await touchUser(input.user_id);
  const { data, error } = await requireDb()
    .from("relationship_signals")
    .upsert(input, { onConflict: "user_id,person_id" })
    .select()
    .single();
  if (error) throw new Error(`relationship_signal upsert: ${error.message}`);
  return data as RelationshipSignal;
}
