/**
 * Fast-path router — deterministic regex patterns for high-precision commands.
 *
 * Only patterns with near-100% precision are included. Ambiguous messages
 * fall through to the LLM classifier. This saves ~1-2s latency and one LLM
 * call for obvious commands.
 *
 * NOTE: `\b` word boundaries don't work with Thai characters in JS regex
 * (Thai chars are not `\w`). Patterns use `(?:\s|$)` or exact strings instead.
 */

interface FastPathResult {
  action: string;
  text: string;
  index?: number;
}

const RULES: Array<{ action: string; pattern: RegExp }> = [
  // Help — unambiguous
  {
    action: "help",
    pattern: /^(?:help|ช่วยอะไรได้บ้าง|ช่วยเหลืออะไรได้|เมนู|วิธีใช้|ทำอะไรได้|ทำไรได้บ้าง|ใช้ยังไง)(?:\s|$)/i,
  },
  {
    action: "help",
    pattern: /^(?:help|เมนู|วิธีใช้)$/i,
  },

  // Todo list
  {
    action: "todo_list",
    pattern: /^(?:มีงานไหม|งานค้าง|งานที่ค้าง|ดูงาน|ค้างอะไร|งานอะไรบ้าง)(?:\s|$|[,.!?])/i,
  },
  {
    action: "todo_list",
    pattern: /^to[\s-]?do(?:\s|$)/i,
  },
  {
    action: "todo_list",
    pattern: /^งานค้าง$/i,
  },

  // Follow-up list
  {
    action: "followup_list",
    pattern: /^(?:มีอะไรรอติดตาม|ติดตามอะไร|รออะไรอยู่|follow[\s-]?up)(?:\s|$|[,.!?])/i,
  },

  // Subscription list
  {
    action: "subscription_list",
    pattern: /^(?:มี\s*subscription|subscription\s*อะไร|สมัครอะไร|จ่ายค่าสมัคร)(?:\s|$|[,.!?])/i,
  },

  // Reminder list
  {
    action: "remind_list",
    pattern: /^(?:ดูการเตือน|มีการเตือน|ตั้งเตือนอะไร|การเตือนอะไร)(?:\s|$|[,.!?])/i,
  },

  // Expense summary — "เดือนนี้ใช้เท่าไร", "สรุปค่าใช้จ่าย"
  {
    action: "expense_summary",
    pattern: /^(?:สรุปค่าใช้จ่าย|ค่าใช้จ่ายเดือนนี้|เดือนนี้ใช้เท่าไร|ใช้เงินไปเท่าไร|สรุปการเงิน)(?:\s|$|[,.!?])/i,
  },

  // Expense list — "ค่าใช้จ่ายล่าสุด"
  {
    action: "expense_list",
    pattern: /^(?:ค่าใช้จ่ายล่าสุด|รายการค่าใช้จ่าย|ดูค่าใช้จ่าย|ค่าใช้จ่ายวันนี้)(?:\s|$|[,.!?])/i,
  },

  // Goal progress
  {
    action: "goal_progress",
    pattern: /^(?:เป้าคืบหน้ายัง|เป้าหมายคืบหน้า|เป้าไหว|ความคืบหน้าเป้า|ก้าวเท่าไร)(?:\s|$|[,.!?])/i,
  },

  // Journal show — "journal วันนี้"
  {
    action: "journal_show",
    pattern: /^(?:journal\s*วันนี้|ไดอารี่วันนี้|ดู\s*journal|โชว์\s*journal)(?:\s|$|[,.!?])/i,
  },

  // Calendar list — "พรุ่งนี้มีนัดไหม"
  {
    action: "calendar_list",
    pattern: /^(?:พรุ่งนี้มีนัด|สัปดาห์นี้ว่า|วันนี้มีนัด|ตารางวันนี้|นัดวันไหน)(?:\s|$|[,.!?])/i,
  },

  // Evening review — must be checked BEFORE briefing
  {
    action: "evening_review",
    pattern: /^(?:สรุปวันนี้ก่อนนอน|สรุปก่อนนอน)(?:\s|$|[,.!?])/i,
  },

  // Briefing — "สรุปวันนี้" (checked after evening_review)
  {
    action: "briefing",
    pattern: /^(?:สรุปวันนี้|สรุปให้หน่อย|เบริฟวันนี้|วันนี้มีอะไรบ้าง)(?:\s|$|[,.!?])/i,
  },
];

export function fastClassify(raw: string): FastPathResult | null {
  const text = raw.trim();
  if (!text) return null;

  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      return { action: rule.action, text };
    }
  }
  return null;
}
