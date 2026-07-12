/**
 * Action Registry — single source of truth for action metadata.
 *
 * All action lists (validAction, PLANNABLE_ACTIONS, DESTRUCTIVE_ACTIONS,
 * HELP_SECTIONS) are derived from this registry. Adding a new action
 * requires exactly one entry here plus a dispatch case in handle.ts.
 */
import type { Action } from "@/lib/intent/router";

export type RiskLevel = "R0" | "R1" | "R2";

export interface ActionMeta {
  action: Action;
  risk: RiskLevel;
  plannable: boolean;
  category: string;
  helpLines?: string[];
}

const CAT_MEMORY = "📝 จด/ค้น/เตือน";
const CAT_TASK = "📋 งาน/ปฏิทิน";
const CAT_DAILY = "☀️ สรุปรายวัน";
const CAT_FOLLOWUP = "🔁 ติดตาม";
const CAT_PEOPLE = "👥 คน/ความจำ";
const CAT_KB = "🧠 สอนให้รู้จักคุณ";
const CAT_FINANCE = "💰 การเงิน";
const CAT_GOAL = "🎯 เป้าหมาย/ไดอารี่";
const CAT_WORK = "📋 ประชุม/เดินทาง/อีเมล";
const CAT_OTHER = "🗑 อื่นๆ";

const REGISTRY: ActionMeta[] = [
  // Memory
  { action: "remember", risk: "R1", plannable: true, category: CAT_MEMORY },
  { action: "recall", risk: "R0", plannable: true, category: CAT_MEMORY },
  { action: "delete_recent", risk: "R2", plannable: false, category: CAT_OTHER, helpLines: ["'ลบที่พึ่งส่ง' → ลบความจำล่าสุด"] },
  { action: "decision_recall", risk: "R0", plannable: true, category: CAT_MEMORY },

  // Reminder
  { action: "remind", risk: "R1", plannable: true, category: CAT_MEMORY, helpLines: ["'เตือน X พรุ่งนี้ 9 โมง' → ตั้งเตือน", "'ดูการเตือน' / 'ยกเลิกการเตือน' / 'เลื่อนการเตือน'"] },
  { action: "remind_list", risk: "R0", plannable: true, category: CAT_MEMORY },
  { action: "remind_cancel", risk: "R2", plannable: true, category: CAT_MEMORY },
  { action: "remind_snooze", risk: "R1", plannable: true, category: CAT_MEMORY },

  // Todo
  { action: "todo_add", risk: "R1", plannable: true, category: CAT_TASK, helpLines: ["'จดงาน: ...' / 'มีงานค้างไหม' → to-do (มีปุ่มกดทำเสร็จ/ยกเลิก)", "'แก้งานที่ 2 เป็น ...' / 'เลื่อนงานแรกไปพรุ่งนี้'", "'ทำงานแรกเสร็จแล้ว' / 'ยกเลิกงานแรก' / 'ลบงานที่ 2'"] },
  { action: "todo_list", risk: "R0", plannable: true, category: CAT_TASK },
  { action: "todo_done", risk: "R1", plannable: true, category: CAT_TASK },
  { action: "todo_cancel", risk: "R1", plannable: true, category: CAT_TASK },
  { action: "todo_update", risk: "R1", plannable: true, category: CAT_TASK },
  { action: "todo_delete", risk: "R2", plannable: true, category: CAT_TASK },

  // Calendar
  { action: "calendar_add", risk: "R2", plannable: true, category: CAT_TASK, helpLines: ["'นัด X พรุ่งนี้ 2 โมงเย็น' → ลงปฏิทิน", "'เชื่อม calendar' → เชื่อม Google Calendar"] },
  { action: "calendar_list", risk: "R0", plannable: true, category: CAT_TASK },

  // Briefing
  { action: "briefing", risk: "R0", plannable: true, category: CAT_DAILY, helpLines: ["'สรุปวันนี้' → Daily Briefing"] },
  { action: "evening_review", risk: "R0", plannable: true, category: CAT_DAILY, helpLines: ["'สรุปวันนี้ก่อนนอน' → Evening Review"] },

  // Follow-up
  { action: "followup_add", risk: "R1", plannable: true, category: CAT_FOLLOWUP, helpLines: ["'ส่งเมลหา X แล้ว' / 'รอ A ส่งไฟล์' → ติดตามอัตโนมัติ (มีปุ่มกดปิด)", "'มีอะไรรอติดตามไหม'", "'เปิดติดตามใหม่' → เปิดเรื่องที่ปิดไปแล้ว"] },
  { action: "followup_list", risk: "R0", plannable: true, category: CAT_FOLLOWUP },
  { action: "followup_close", risk: "R1", plannable: true, category: CAT_FOLLOWUP },
  { action: "followup_reopen", risk: "R1", plannable: true, category: CAT_FOLLOWUP },

  // People
  { action: "people_ask", risk: "R0", plannable: true, category: CAT_PEOPLE, helpLines: ["'John เป็นใคร' → ข้อมูลคนที่เคยจด"] },
  { action: "people_set_tier", risk: "R1", plannable: true, category: CAT_PEOPLE, helpLines: ["'ตั้ง คุณแม่ เป็น P1' → ระดับความสำคัญ (P1 สุด–P4 เย็น)"] },

  // Expense
  { action: "expense_add", risk: "R1", plannable: true, category: CAT_FINANCE, helpLines: ["'ซื้อกาแฟ 85' → บันทึกค่าใช้จ่าย", "'เดือนนี้ใช้เท่าไร' → สรุปค่าใช้จ่าย", "'ค่าใช้จ่ายล่าสุด' → ดูรายการ", "'ลบค่าใช้จ่ายอันแรก' → ลบรายการ"] },
  { action: "expense_summary", risk: "R0", plannable: true, category: CAT_FINANCE },
  { action: "expense_list", risk: "R0", plannable: true, category: CAT_FINANCE },
  { action: "expense_delete", risk: "R2", plannable: true, category: CAT_FINANCE },
  { action: "subscription_add", risk: "R1", plannable: true, category: CAT_FINANCE, helpLines: ["'สมัคร Netflix 199/เดือน' → subscription", "'ยกเลิก Netflix' → ยกเลิก subscription"] },
  { action: "subscription_list", risk: "R0", plannable: true, category: CAT_FINANCE },
  { action: "subscription_cancel", risk: "R1", plannable: true, category: CAT_FINANCE },

  // Goal
  { action: "goal_add", risk: "R1", plannable: true, category: CAT_GOAL, helpLines: ["'ตั้งเป้า เรียนภาษา 45 นาที/วัน'", "'วันนี้เรียนภาษา 30 นาที' → บันทึกความคืบหน้า", "'เป้าคืบหน้ายัง'", "'พักเป้า' / 'ทำต่อ' / 'เก็บเป้า' → จัดการสถานะ", "'เขียนไดอารี่ ...' → เขียนเอง / 'journal วันนี้' → ดู"] },
  { action: "goal_log", risk: "R1", plannable: true, category: CAT_GOAL },
  { action: "goal_progress", risk: "R0", plannable: true, category: CAT_GOAL },
  { action: "goal_manage", risk: "R1", plannable: true, category: CAT_GOAL },

  // Journal
  { action: "journal_add", risk: "R1", plannable: true, category: CAT_GOAL },
  { action: "journal_show", risk: "R0", plannable: true, category: CAT_GOAL },

  // Meeting / Travel / Email
  { action: "meeting_prep", risk: "R0", plannable: true, category: CAT_WORK, helpLines: ["'สรุปประชุม...' → จดแท็ก #meeting อัตโนมัติ", "'ประชุมล่าสุดเรื่องอะไร' → ดึงบันทึกประชุม", "'เตรียมประชุม' → brief ก่อนนัด", "'บินพรุ่งนี้' → checklist เดินทาง", "'สรุปเมล' → Inbox Zero", "'ตอบเมล ...' → ร่างคำตอบ"] },
  { action: "meeting_list", risk: "R0", plannable: true, category: CAT_WORK },
  { action: "travel_checklist", risk: "R0", plannable: true, category: CAT_WORK },
  { action: "email_summary", risk: "R0", plannable: true, category: CAT_WORK },
  { action: "email_reply", risk: "R2", plannable: true, category: CAT_WORK },

  // Web search
  { action: "web_search", risk: "R0", plannable: true, category: CAT_WORK },

  // Knowledge base
  { action: "kb_add", risk: "R1", plannable: true, category: CAT_KB, helpLines: ["'จำไว้ว่าผมชื่อ...' → จดข้อมูลถาวรเกี่ยวกับคุณ", "'จำไว้ว่าเวลาตอบเมลให้เป็นทางการ' → คำสั่งประจำ", "'รู้อะไรเกี่ยวกับผมบ้าง' → ดูสิ่งที่ผมจำไว้", "'ลืมข้อ 2' / 'ลบที่จำว่า...' → ลบข้อมูลที่จำผิด"] },
  { action: "kb_ask", risk: "R0", plannable: true, category: CAT_KB },
  { action: "kb_forget", risk: "R2", plannable: true, category: CAT_KB },

  // Meta
  { action: "chat", risk: "R0", plannable: false, category: CAT_OTHER },
  { action: "help", risk: "R0", plannable: false, category: CAT_OTHER },
  { action: "plan", risk: "R0", plannable: false, category: CAT_OTHER },
];

const REGISTRY_MAP = new Map<Action, ActionMeta>(REGISTRY.map((m) => [m.action, m]));

export function getActionMeta(action: string): ActionMeta | undefined {
  return REGISTRY_MAP.get(action as Action);
}

export function isValidAction(action: unknown): action is Action {
  return REGISTRY_MAP.has(action as Action);
}

export function actionRiskLevel(action: string): RiskLevel {
  return REGISTRY_MAP.get(action as Action)?.risk ?? "R0";
}

export const ALL_ACTIONS: ReadonlySet<Action> = new Set(REGISTRY_MAP.keys());

export const PLANNABLE_ACTIONS: ReadonlySet<string> = new Set(
  REGISTRY.filter((m) => m.plannable).map((m) => m.action),
);

export const DESTRUCTIVE_ACTIONS: ReadonlySet<string> = new Set(
  REGISTRY.filter((m) => m.risk === "R2").map((m) => m.action),
);

export const EXTERNAL_ACTIONS: ReadonlySet<string> = new Set(
  REGISTRY.filter((m) => m.risk === "R2" && (m.action === "calendar_add" || m.action === "email_reply")).map((m) => m.action),
);

export const PLANNABLE_WRITE_ACTIONS: ReadonlySet<string> = new Set(
  REGISTRY.filter((m) => m.plannable && (m.risk === "R1" || m.risk === "R2")).map((m) => m.action),
);

export interface HelpSection {
  title: string;
  lines: string[];
}

export function buildHelpSections(): HelpSection[] {
  const byCategory = new Map<string, string[]>();
  for (const m of REGISTRY) {
    if (!m.helpLines || m.helpLines.length === 0) continue;
    const existing = byCategory.get(m.category) ?? [];
    existing.push(...m.helpLines);
    byCategory.set(m.category, existing);
  }
  const sections: HelpSection[] = [];
  for (const [title, lines] of byCategory) {
    sections.push({ title, lines });
  }
  return sections;
}
