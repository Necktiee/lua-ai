/**
 * Dashboard: open follow-ups (waiting-for items) + close action.
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import { listOpenFollowUps, closeFollowUp } from "@/lib/followup/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const followUps = await listOpenFollowUps(userId);
  return Response.json({ followUps });
}

export async function PATCH(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.id) return Response.json({ error: "id required" }, { status: 400 });

  const ok = await closeFollowUp(userId, body.id);
  return Response.json({ ok });
}
