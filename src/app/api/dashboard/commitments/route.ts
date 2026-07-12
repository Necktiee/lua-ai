import { requireSessionUser } from "@/lib/auth/require-session";
import { addCommitment, listOpenCommitments, resolveCommitment } from "@/lib/commitment/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  return Response.json({ commitments: await listOpenCommitments(userId) });
}

export async function POST(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.title !== "string" || !body.title.trim() || (body.responsibleParty !== "owner" && body.responsibleParty !== "other")) {
    return Response.json({ error: "title and responsibleParty required" }, { status: 400 });
  }
  const commitment = await addCommitment({ user_id: userId, title: body.title.trim(), responsible_party: body.responsibleParty, counterparty: typeof body.counterparty === "string" ? body.counterparty.trim() || null : null, due_at: typeof body.dueAt === "string" ? body.dueAt : null });
  return Response.json({ commitment }, { status: 201 });
}

export async function PATCH(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string" || (body.status !== "fulfilled" && body.status !== "cancelled")) return Response.json({ error: "id and terminal status required" }, { status: 400 });
  const ok = await resolveCommitment(userId, body.id, body.status, typeof body.outcome === "string" ? body.outcome : undefined);
  return ok ? Response.json({ ok: true }) : Response.json({ error: "not found" }, { status: 404 });
}
