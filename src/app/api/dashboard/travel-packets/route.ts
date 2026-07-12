import { requireSessionUser } from "@/lib/auth/require-session";
import { addTravelPacket, listTravelPackets, setTravelPacketStatus, type TravelPacketStatus } from "@/lib/travel/repo";

const STATUSES = new Set<TravelPacketStatus>(["planned", "active", "completed", "cancelled"]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "active" ? "active" : "all";
  const packets = await listTravelPackets(userId, scope);
  return Response.json({ travelPackets: packets });
}

export async function POST(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.title !== "string" ||
    !body.title.trim() ||
    typeof body.destination !== "string" ||
    !body.destination.trim() ||
    typeof body.startDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate) ||
    typeof body.endDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(body.endDate) ||
    body.endDate < body.startDate
  ) {
    return Response.json(
      { error: "title, destination, startDate, endDate (endDate>=startDate) required" },
      { status: 400 },
    );
  }
  const packet = await addTravelPacket({
    user_id: userId,
    title: body.title.trim(),
    destination: body.destination.trim(),
    start_date: body.startDate,
    end_date: body.endDate,
    home_timezone: typeof body.homeTimezone === "string" ? body.homeTimezone : undefined,
    dest_timezone: typeof body.destTimezone === "string" ? body.destTimezone : undefined,
    itinerary: Array.isArray(body.itinerary) ? body.itinerary : undefined,
    checklist: Array.isArray(body.checklist) ? body.checklist : undefined,
    alerts: Array.isArray(body.alerts) ? body.alerts : undefined,
  });
  return Response.json({ travelPacket: packet }, { status: 201 });
}

export async function PATCH(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.id !== "string" ||
    typeof body.status !== "string" ||
    !STATUSES.has(body.status as TravelPacketStatus)
  ) {
    return Response.json({ error: "id and valid status required" }, { status: 400 });
  }
  const ok = await setTravelPacketStatus(userId, body.id, body.status as TravelPacketStatus);
  return ok ? Response.json({ ok: true }) : Response.json({ error: "not found" }, { status: 404 });
}
