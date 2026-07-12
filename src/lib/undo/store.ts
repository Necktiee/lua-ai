/**
 * Short-lived undo tokens for destructive dashboard / agent mutations.
 * TTL default 5 minutes.
 */
import { requireDb } from "@/lib/db/client";

const DEFAULT_TTL_MS = 5 * 60_000;

export interface UndoToken {
  id: string;
  user_id: string;
  kind: string;
  label: string;
  payload: Record<string, unknown>;
  expires_at: string;
}

export async function createUndoToken(args: {
  userId: string;
  kind: string;
  label: string;
  payload: Record<string, unknown>;
  ttlMs?: number;
}): Promise<UndoToken | null> {
  const db = requireDb();
  const expires = new Date(Date.now() + (args.ttlMs ?? DEFAULT_TTL_MS)).toISOString();
  const { data, error } = await db
    .from("undo_tokens")
    .insert({
      user_id: args.userId,
      kind: args.kind,
      label: args.label,
      payload: args.payload,
      expires_at: expires,
    })
    .select()
    .maybeSingle();
  if (error) {
    console.warn("[undo] create", error.message);
    return null;
  }
  return data as UndoToken;
}

export async function consumeUndoToken(
  userId: string,
  tokenId: string,
): Promise<UndoToken | null> {
  const db = requireDb();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("undo_tokens")
    .update({ consumed_at: now })
    .eq("id", tokenId)
    .eq("user_id", userId)
    .is("consumed_at", null)
    .gt("expires_at", now)
    .select()
    .maybeSingle();
  if (error) {
    console.warn("[undo] consume", error.message);
    return null;
  }
  return (data as UndoToken | null) ?? null;
}
