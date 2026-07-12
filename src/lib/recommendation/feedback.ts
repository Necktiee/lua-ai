import { requireDb, touchUser } from "@/lib/db/client";

export type RecommendationFeedbackAction = "accepted" | "dismissed" | "corrected" | "opted_out";

export async function recordRecommendationFeedback(input: {
  userId: string;
  feature: string;
  recommendationKey: string;
  action: RecommendationFeedbackAction;
  minutesSaved?: number;
  note?: string;
}) {
  await touchUser(input.userId);
  const { error } = await requireDb().from("recommendation_feedback").upsert({
    user_id: input.userId,
    feature: input.feature,
    recommendation_key: input.recommendationKey,
    action: input.action,
    minutes_saved: input.minutesSaved ?? null,
    note: input.note?.trim() || null,
  }, { onConflict: "user_id,feature,recommendation_key,action" });
  if (error) throw new Error(`recommendation feedback: ${error.message}`);
}
