/**
 * Webhook inbox — durable event persistence for LINE webhook idempotency.
 *
 * Flow:
 *   1. receiveEvent: insert with status='pending' (unique on webhookEventId).
 *      Returns false if already exists (duplicate redelivery → skip).
 *   2. claimEvent: atomic update from 'pending' to 'processing'.
 *      Returns false if already claimed by another worker.
 *   3. markDone / markFailed: finalize after processing.
 *   4. staleEvents: poll cron picks up 'processing' rows older than a lease
 *      threshold and retries them.
 */
import { requireDb } from "@/lib/db/client";

export interface WebhookEventRow {
  id: string;
  webhook_event_id: string;
  user_id: string | null;
  status: "pending" | "processing" | "done" | "failed" | "dead_letter";
  attempts: number;
  text_content: string | null;
  reply_token: string | null;
  source_type: string | null;
  message_type: string | null;
  message_id: string | null;
}

export interface ReceiveEventArgs {
  webhookEventId: string;
  userId?: string;
  replyToken?: string;
  sourceType?: string;
  messageType?: string;
  messageId?: string;
  textContent?: string;
}

/**
 * Insert a webhook event into the durable inbox. Returns the row if newly
 * inserted, or null if it already exists (duplicate redelivery).
 */
export async function receiveEvent(
  args: ReceiveEventArgs,
): Promise<WebhookEventRow | null> {
  const db = requireDb();
  const { data, error } = await db
    .from("webhook_events")
    .insert({
      webhook_event_id: args.webhookEventId,
      user_id: args.userId ?? null,
      reply_token: args.replyToken ?? null,
      source_type: args.sourceType ?? null,
      message_type: args.messageType ?? null,
      message_id: args.messageId ?? null,
      text_content: args.textContent ?? null,
      status: "pending",
    })
    .select()
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return null;
    console.warn("[webhook-inbox] receive", error.message);
    return null;
  }
  return (data as WebhookEventRow | null) ?? null;
}

/**
 * Atomically claim a pending event for processing. Returns the row if
 * claimed, or null if already processing/done.
 */
export async function claimEvent(
  webhookEventId: string,
): Promise<WebhookEventRow | null> {
  const db = requireDb();
  const { data, error } = await db
    .from("webhook_events")
    .update({ status: "processing", claimed_at: new Date().toISOString() })
    .eq("webhook_event_id", webhookEventId)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (error) {
    console.warn("[webhook-inbox] claim", error.message);
    return null;
  }
  return (data as WebhookEventRow | null) ?? null;
}

/** Mark an event as successfully processed. */
export async function markDone(webhookEventId: string): Promise<void> {
  const db = requireDb();
  const { error } = await db
    .from("webhook_events")
    .update({ status: "done", processed_at: new Date().toISOString() })
    .eq("webhook_event_id", webhookEventId);
  if (error) console.warn("[webhook-inbox] markDone", error.message);
}

/**
 * Mark an event as failed. After 3 attempts, move to dead_letter.
 */
export async function markFailed(
  webhookEventId: string,
  errorMsg: string,
): Promise<void> {
  const db = requireDb();
  const { data: row } = await db
    .from("webhook_events")
    .select("attempts")
    .eq("webhook_event_id", webhookEventId)
    .maybeSingle();
  const attempts = (row as { attempts?: number } | null)?.attempts ?? 0;
  const newAttempts = attempts + 1;
  const status = newAttempts >= 3 ? "dead_letter" : "failed";
  const { error } = await db
    .from("webhook_events")
    .update({ status, attempts: newAttempts, error: errorMsg.slice(0, 500) })
    .eq("webhook_event_id", webhookEventId);
  if (error) console.warn("[webhook-inbox] markFailed", error.message);
}

/**
 * Find stale 'processing' events that exceeded their lease (for poll cron).
 * Returns events that should be retried.
 */
export async function staleEvents(
  leaseMinutes = 5,
  limit = 10,
): Promise<WebhookEventRow[]> {
  const db = requireDb();
  const cutoff = new Date(Date.now() - leaseMinutes * 60_000).toISOString();
  const { data, error } = await db
    .from("webhook_events")
    .select("*")
    .eq("status", "processing")
    .lt("claimed_at", cutoff)
    .order("claimed_at", { ascending: true })
    .limit(limit);
  if (error) console.warn("[webhook-inbox] stale", error.message);
  return (data ?? []) as WebhookEventRow[];
}

/**
 * Reset a stale event back to 'pending' so it can be re-claimed.
 */
export async function resetStale(webhookEventId: string): Promise<void> {
  const db = requireDb();
  const { error } = await db
    .from("webhook_events")
    .update({ status: "pending", claimed_at: null })
    .eq("webhook_event_id", webhookEventId)
    .eq("status", "processing");
  if (error) console.warn("[webhook-inbox] resetStale", error.message);
}
