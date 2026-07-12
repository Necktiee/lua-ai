import { requireSessionUser } from "@/lib/auth/require-session";
import { recordRecommendationFeedback, type RecommendationFeedbackAction } from "@/lib/recommendation/feedback";

const ACTIONS = new Set<RecommendationFeedbackAction>(["accepted", "dismissed", "corrected", "opted_out"]);

export async function POST(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.feature !== "string" || typeof body.recommendationKey !== "string" || typeof body.action !== "string" || !ACTIONS.has(body.action as RecommendationFeedbackAction)) {
    return Response.json({ error: "feature, recommendationKey, and valid action required" }, { status: 400 });
  }
  await recordRecommendationFeedback({
    userId,
    feature: body.feature.slice(0, 80),
    recommendationKey: body.recommendationKey.slice(0, 160),
    action: body.action as RecommendationFeedbackAction,
    minutesSaved: typeof body.minutesSaved === "number" ? body.minutesSaved : undefined,
    note: typeof body.note === "string" ? body.note : undefined,
  });
  return Response.json({ ok: true });
}
