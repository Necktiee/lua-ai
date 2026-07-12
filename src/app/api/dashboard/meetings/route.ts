import { requireSessionUser } from "@/lib/auth/require-session";
import { addMeeting, listRecentMeetings } from "@/lib/meeting/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const meetings = await listRecentMeetings(userId);
  return Response.json({ meetings });
}

export async function POST(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return Response.json({ error: "title required" }, { status: 400 });
  }
  const meeting = await addMeeting({
    user_id: userId,
    title: body.title.trim(),
    occurred_at: typeof body.occurredAt === "string" ? body.occurredAt : undefined,
    participants: Array.isArray(body.participants)
      ? (body.participants as string[]).filter((p) => typeof p === "string").slice(0, 32)
      : [],
    summary: typeof body.summary === "string" ? body.summary.trim() || null : null,
    source: "manual",
  });
  return Response.json({ meeting }, { status: 201 });
}
