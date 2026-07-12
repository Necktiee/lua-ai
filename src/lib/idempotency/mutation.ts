/**
 * Mutation idempotency — event ID + action + normalized target → one effect.
 */
import { createHash } from "node:crypto";
import { requireDb } from "@/lib/db/client";

const MUTATING = new Set([
  "remember",
  "remind",
  "todo_add",
  "todo_done",
  "todo_cancel",
  "todo_update",
  "todo_delete",
  "calendar_add",
  "followup_add",
  "followup_close",
  "followup_reopen",
  "expense_add",
  "expense_delete",
  "subscription_add",
  "subscription_cancel",
  "goal_add",
  "goal_log",
  "goal_manage",
  "kb_add",
  "kb_forget",
  "people_set_tier",
  "journal_add",
  "remind_cancel",
  "remind_snooze",
  "delete_recent",
  "plan",
]);

export function isMutatingAction(action: string): boolean {
  return MUTATING.has(action);
}

/** Collapse whitespace / case for stable target fingerprint. */
export function normalizeTarget(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 500);
}

export function makeMutationKey(
  webhookEventId: string,
  action: string,
  target: string,
): string {
  const norm = normalizeTarget(target);
  const material = `${webhookEventId}|${action}|${norm}`;
  return createHash("sha256").update(material, "utf8").digest("hex");
}

export type ClaimResult = "claimed" | "duplicate" | "skipped";

/**
 * Atomically claim a mutation key. Returns:
 * - claimed: first time — proceed with side effects
 * - duplicate: already applied — skip side effects
 * - skipped: no webhookEventId or non-mutating action
 */
export async function claimMutation(args: {
  userId: string;
  webhookEventId?: string;
  action: string;
  target: string;
}): Promise<ClaimResult> {
  if (!args.webhookEventId || !isMutatingAction(args.action)) return "skipped";

  const key = makeMutationKey(args.webhookEventId, args.action, args.target);
  const db = requireDb();
  const { error } = await db.from("mutation_keys").insert({
    mutation_key: key,
    user_id: args.userId,
    webhook_event_id: args.webhookEventId,
    action: args.action,
    target: normalizeTarget(args.target),
  });
  if (error) {
    if (error.code === "23505") return "duplicate";
    console.warn("[mutation] claim", error.message);
    // Fail-open on DB errors so we don't block the user — webhook-level
    // idempotency still prevents full re-processing of the event.
    return "claimed";
  }
  return "claimed";
}

/** Backoff delay ms for attempt N (1-based) before next retry. */
export function retryBackoffMs(attempt: number): number {
  // 30s, 2min, then dead_letter at attempt 3
  if (attempt <= 1) return 30_000;
  if (attempt === 2) return 120_000;
  return 300_000;
}
