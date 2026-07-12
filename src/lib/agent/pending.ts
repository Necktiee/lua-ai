import { requireDb } from "@/lib/db/client";
import type { Plan } from "@/lib/agent/planner";

const PENDING_TTL_MS = 5 * 60 * 1000;

export interface PendingAction {
  id: string;
  userId: string;
  kind: string;
  payload: Plan;
  riskLevel: string;
  policyVersion: string | null;
  sourceEventId: string | null;
  idempotencyKey: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
  consumedAt: string | null;
}

export async function createPendingAction(params: {
  userId: string;
  payload: Plan;
  riskLevel?: string;
  policyVersion?: string;
  sourceEventId?: string;
  idempotencyKey?: string;
}): Promise<string> {
  const db = requireDb();
  const expiresAt = new Date(Date.now() + PENDING_TTL_MS).toISOString();
  const { data, error } = await db
    .from("pending_actions")
    .insert({
      user_id: params.userId,
      kind: "plan_confirmation",
      payload: params.payload,
      risk_level: params.riskLevel ?? "R2",
      policy_version: params.policyVersion ?? null,
      source_event_id: params.sourceEventId ?? null,
      idempotency_key: params.idempotencyKey ?? null,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createPendingAction: ${error.message}`);
  return data.id;
}

export async function getPendingAction(
  userId: string,
): Promise<PendingAction | null> {
  const db = requireDb();
  const { data, error } = await db
    .from("pending_actions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[pending-actions] getPendingAction", error.message);
    return null;
  }
  return (data as PendingAction) ?? null;
}

export async function consumePendingAction(
  id: string,
): Promise<PendingAction | null> {
  const db = requireDb();
  const { data, error } = await db
    .from("pending_actions")
    .update({
      status: "consumed",
      consumed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .select("*")
    .single();
  if (error || !data) return null;
  return data as PendingAction;
}

export async function expireStalePendingActions(userId: string): Promise<void> {
  const db = requireDb();
  await db
    .from("pending_actions")
    .update({ status: "expired" })
    .eq("user_id", userId)
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());
}

/**
 * Cancel all active pending actions for a user (regardless of expiry).
 * Used by the "ยกเลิกแผน" correction command.
 */
export async function cancelPendingActions(userId: string): Promise<number> {
  const db = requireDb();
  const { count } = await db
    .from("pending_actions")
    .update({ status: "cancelled", consumed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("status", "pending");
  return count ?? 0;
}
