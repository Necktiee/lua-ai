import { requireSessionUser } from "@/lib/auth/require-session";
import { addDecision, listDecisionsDueForReview, listOpenDecisions, reviewDecision } from "@/lib/decision/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope");
  const decisions =
    scope === "due"
      ? await listDecisionsDueForReview(userId)
      : await listOpenDecisions(userId);
  return Response.json({ decisions });
}

export async function POST(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return Response.json({ error: "title required" }, { status: 400 });
  }
  const decision = await addDecision({
    user_id: userId,
    title: body.title.trim(),
    options: Array.isArray(body.options) ? (body.options as string[]).slice(0, 8) : [],
    rationale: typeof body.rationale === "string" ? body.rationale.trim() || null : null,
    assumptions: Array.isArray(body.assumptions) ? (body.assumptions as string[]).slice(0, 8) : [],
    review_at: typeof body.reviewAt === "string" ? body.reviewAt : null,
  });
  return Response.json({ decision }, { status: 201 });
}

export async function PATCH(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.id !== "string" ||
    typeof body.outcome !== "string" ||
    !body.outcome.trim() ||
    (body.status !== "reviewed" && body.status !== "superseded" && body.status !== undefined)
  ) {
    return Response.json({ error: "id and outcome required" }, { status: 400 });
  }
  const ok = await reviewDecision(
    userId,
    body.id,
    body.outcome,
    body.status === "superseded" ? "superseded" : "reviewed",
  );
  return ok ? Response.json({ ok: true }) : Response.json({ error: "not found" }, { status: 404 });
}
