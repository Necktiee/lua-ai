/**
 * Dashboard: upcoming Google Calendar events (7-day window by default).
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import { listEvents } from "@/lib/calendar/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 7, 1), 30);

  try {
    const events = await listEvents(userId, days);
    return Response.json({
      events: events.map((e) => ({
        id: e.id,
        summary: e.summary,
        start: e.start?.dateTime ?? e.start?.date,
        end: e.end?.dateTime ?? e.end?.date,
        location: e.location ?? null,
      })),
    });
  } catch (e) {
    return Response.json({ events: [], error: (e as Error).message }, { status: 200 });
  }
}
