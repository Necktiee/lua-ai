/**
 * User data export — JSON dump of owner-owned rows (no secrets / embeddings).
 */
import { requireDb } from "@/lib/db/client";

const TABLES = [
  "memory",
  "todos",
  "reminders",
  "calendar_events",
  "messages",
  "people",
  "people_mentions",
  "follow_ups",
  "expenses",
  "subscriptions",
  "goals",
  "goal_logs",
  "journal_entries",
  "relations",
  "knowledge",
  "knowledge_versions",
  "user_settings",
  "email_notified",
  "meeting_brief_claims",
] as const;

const STRIP_COLS = new Set(["embedding", "access_token", "refresh_token"]);

function stripRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (STRIP_COLS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

export interface ExportPayload {
  exported_at: string;
  user_id: string;
  user: Record<string, unknown> | null;
  tables: Record<string, Record<string, unknown>[]>;
}

export async function exportUserData(userId: string): Promise<ExportPayload> {
  const db = requireDb();

  const { data: user } = await db
    .from("users")
    .select("line_user_id, display_name, created_at, last_seen")
    .eq("line_user_id", userId)
    .maybeSingle();

  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const table of TABLES) {
    const { data, error } = await db.from(table).select("*").eq("user_id", userId);
    if (error) {
      console.warn(`[export] ${table}`, error.message);
      tables[table] = [];
      continue;
    }
    tables[table] = ((data ?? []) as Record<string, unknown>[]).map(stripRow);
  }

  return {
    exported_at: new Date().toISOString(),
    user_id: userId,
    user: (user as Record<string, unknown> | null) ?? null,
    tables,
  };
}
