import { requireDb, touchUser } from "@/lib/db/client";

export type TravelPacketStatus = "planned" | "active" | "completed" | "cancelled";

export type TravelPacket = {
  id: string;
  user_id: string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  home_timezone: string;
  dest_timezone: string;
  itinerary: unknown[];
  checklist: unknown[];
  alerts: unknown[];
  document_ids: unknown[];
  status: TravelPacketStatus;
  source_memory_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function listTravelPackets(
  userId: string,
  scope: "active" | "all" = "all",
  limit = 20,
): Promise<TravelPacket[]> {
  let q = requireDb()
    .from("travel_packets")
    .select("*")
    .eq("user_id", userId)
    .order("start_date", { ascending: false })
    .limit(limit);
  if (scope === "active") {
    q = q.in("status", ["planned", "active"]);
  }
  const { data, error } = await q;
  if (error) throw new Error(`travel_packets list: ${error.message}`);
  return (data ?? []) as TravelPacket[];
}

export async function addTravelPacket(
  input: Pick<TravelPacket, "user_id" | "title" | "destination" | "start_date" | "end_date"> &
    Partial<
      Pick<
        TravelPacket,
        | "home_timezone"
        | "dest_timezone"
        | "itinerary"
        | "checklist"
        | "alerts"
        | "document_ids"
        | "status"
        | "source_memory_id"
      >
    >,
): Promise<TravelPacket> {
  await touchUser(input.user_id);
  const { data, error } = await requireDb()
    .from("travel_packets")
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(`travel_packet insert: ${error.message}`);
  return data as TravelPacket;
}

export async function setTravelPacketStatus(
  userId: string,
  id: string,
  status: TravelPacketStatus,
): Promise<boolean> {
  const { data, error } = await requireDb()
    .from("travel_packets")
    .update({ status })
    .eq("user_id", userId)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`travel_packet status: ${error.message}`);
  return Boolean(data);
}
