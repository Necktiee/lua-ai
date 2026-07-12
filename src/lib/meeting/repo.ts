import { requireDb, touchUser } from "@/lib/db/client";

export type Meeting = {
  id: string;
  user_id: string;
  title: string;
  occurred_at: string;
  participants: string[];
  summary: string | null;
  extracted_commitments: unknown[];
  extracted_decisions: unknown[];
  source: "manual" | "transcript" | "calendar" | "agent";
  source_memory_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function listRecentMeetings(userId: string, limit = 20): Promise<Meeting[]> {
  const { data, error } = await requireDb()
    .from("meetings")
    .select("*")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`meetings list: ${error.message}`);
  return (data ?? []) as Meeting[];
}

export async function getMeeting(userId: string, id: string): Promise<Meeting | null> {
  const { data, error } = await requireDb()
    .from("meetings")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`meeting get: ${error.message}`);
  return (data as Meeting) ?? null;
}

export async function addMeeting(
  input: Pick<Meeting, "user_id" | "title"> &
    Partial<
      Pick<
        Meeting,
        | "occurred_at"
        | "participants"
        | "summary"
        | "extracted_commitments"
        | "extracted_decisions"
        | "source"
        | "source_memory_id"
      >
    >,
): Promise<Meeting> {
  await touchUser(input.user_id);
  const { data, error } = await requireDb().from("meetings").insert(input).select().single();
  if (error) throw new Error(`meeting insert: ${error.message}`);
  return data as Meeting;
}
