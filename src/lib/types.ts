/** Shared types สำหรับทั้ง project */
import type { ChatRole } from "@/lib/llm/types";

export type LineUserId = string;

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Memory entry — ทุกอย่างที่ user ส่งเข้ามาให้จด */
export interface MemoryRecord {
  id: string;
  user_id: LineUserId;
  kind: "text" | "image" | "audio" | "file" | "link";
  /** ข้อความที่ใช้ embed (สรุป/คำขยาย) */
  content: string;
  /** raw ของแต่ละ kind เช่น LINE message id / url / transcription */
  raw?: Record<string, unknown>;
  /** path ใน storage ถ้าเป็นไฟล์ */
  storage_path?: string;
  /** flexible tags: decision, expense, receipt, travel, meeting... */
  tags?: string[];
  created_at: string;
  /** Phase 4: provenance + dedup + embedding lifecycle */
  source_type?: string;
  source_id?: string | null;
  content_hash?: string | null;
  embedding_model?: string | null;
  embedding_status?: string;
}

export interface TodoRecord {
  id: string;
  user_id: LineUserId;
  title: string;
  due_at?: string | null;
  /** 1 = ด่วน, 2 = ปกติ (default), 3 = ไม่รีบ */
  priority: 1 | 2 | 3;
  status: "pending" | "done" | "cancelled";
  /** Linked auto-reminder (set when todo_add creates a pre-due reminder). */
  reminder_id?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface ReminderRecord {
  id: string;
  user_id: LineUserId;
  message: string;
  fire_at: string;
  qstash_msg_id?: string | null;
  fired: boolean;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  user_id: LineUserId;
  google_event_id?: string;
  summary: string;
  start_at: string;
  end_at?: string;
  location?: string;
  created_at: string;
}

// ============================================================
// Phase 1 new types
// ============================================================

export interface Person {
  id: string;
  user_id: LineUserId;
  name: string;
  aliases: string[];
  notes: Record<string, unknown>;
  /** Contact tier P1-P4 (user-mutable). null = uncategorized, treated as P3. */
  tier?: 1 | 2 | 3 | 4 | null;
  last_seen?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PeopleMention {
  id: string;
  people_id: string;
  memory_id: string;
  user_id: LineUserId;
  created_at: string;
}

export interface FollowUp {
  id: string;
  user_id: LineUserId;
  subject: string;
  waiting_for?: string | null;
  deadline?: string | null;
  status: "open" | "closed" | "nudged";
  nudged_count: number;
  related_memory_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  user_id: LineUserId;
  amount: number;
  currency: string;
  category: string;
  description?: string | null;
  expense_date: string;
  related_memory_id?: string | null;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: LineUserId;
  name: string;
  amount: number;
  currency: string;
  billing_cycle: "monthly" | "yearly" | "weekly";
  next_billing?: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Goal {
  id: string;
  user_id: LineUserId;
  title: string;
  target_value?: number | null;
  current_value: number;
  unit?: string | null;
  period: "daily" | "weekly" | "monthly";
  deadline?: string | null;
  status: "active" | "paused" | "done" | "archived";
  created_at: string;
  updated_at: string;
}

export interface GoalLog {
  id: string;
  goal_id: string;
  user_id: LineUserId;
  value: number;
  note?: string | null;
  logged_at: string;
}

export interface JournalEntry {
  id: string;
  user_id: LineUserId;
  content: string;
  entry_date: string;
  auto_generated: boolean;
  related_memory_ids: string[];
  created_at: string;
}

export interface Relation {
  id: string;
  user_id: LineUserId;
  from_type: string;
  from_id: string;
  relation: string;
  to_type: string;
  to_id: string;
  meta?: Record<string, unknown>;
  created_at: string;
}

export interface UserSettings {
  user_id: LineUserId;
  briefing_time: string;
  evening_time: string;
  briefing_enabled: boolean;
  evening_enabled: boolean;
  auto_journal_enabled: boolean;
  follow_up_nudge_days: number;
  timezone: string;
  updated_at: string;
}

/**
 * Knowledge Base entry — declarative owner profile / preferences / standing
 * instructions (SOP). Unlike MemoryRecord (episodic, RAG-only), priority=1
 * rows are injected into the agent's context on EVERY turn.
 */
export interface KnowledgeRecord {
  id: string;
  user_id: LineUserId;
  /** 'profile' | 'preference' | 'sop' | 'context' | 'relationship' */
  category: "profile" | "preference" | "sop" | "context" | "relationship";
  key: string;
  value: string;
  /** 1 = always inject, 2 = inject if room, 3 = RAG-only */
  priority: 1 | 2 | 3;
  /** 'user' | 'inferred' | 'system' */
  source: "user" | "inferred" | "system";
  created_at: string;
  updated_at: string;
}
