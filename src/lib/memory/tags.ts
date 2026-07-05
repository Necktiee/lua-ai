/**
 * Parse time range expressions for context memory queries.
 * "เมื่อปีที่แล้ว" → { startDate, endDate }
 * "สัปดาห์ที่แล้ว" → { ... }
 * "เดือนที่แล้ว" → { ... }
 * "3 เดือนที่แล้ว" → { startDate: 3 months ago }
 */
import {
  BANGKOK,
  localDateStr,
  localDayBounds,
  localMonthBoundsFor,
  localYearBounds,
} from "@/lib/tz";

export interface DateRange {
  startDate?: string;
  endDate?: string;
}

export function parseDateRange(text: string, timeZone = BANGKOK): DateRange & { consumed: string } {
  const now = new Date();
  const lower = text.toLowerCase();
  const ymd = localDateStr(now, timeZone);
  const [y, m] = ymd.split("-").map(Number);

  // เมื่อปีที่แล้ว / ปีที่แล้ว
  if (/ปีที่แล้ว|last year/.test(lower)) {
    const bounds = localYearBounds(y - 1, timeZone);
    return { startDate: bounds.start, endDate: bounds.end, consumed: "ปีที่แล้ว" };
  }

  // ปีนี้
  if (/ปีนี้|this year/.test(lower)) {
    const bounds = localYearBounds(y, timeZone);
    return { startDate: bounds.start, consumed: "ปีนี้" };
  }

  // เดือนที่แล้ว / last month
  if (/เดือนที่แล้ว|last month/.test(lower)) {
    const pm = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
    const bounds = localMonthBoundsFor(pm.y, pm.m, timeZone);
    return { startDate: bounds.start, endDate: bounds.end, consumed: "เดือนที่แล้ว" };
  }

  // เดือนนี้
  if (/เดือนนี้|this month/.test(lower)) {
    const bounds = localMonthBoundsFor(y, m, timeZone);
    return { startDate: bounds.start, consumed: "เดือนนี้" };
  }

  // สัปดาห์ที่แล้ว / last week
  if (/สัปดาห์ที่แล้ว|last week/.test(lower)) {
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const { start } = localDayBounds(weekAgo, timeZone);
    const { end } = localDayBounds(now, timeZone);
    return { startDate: start, endDate: end, consumed: "สัปดาห์ที่แล้ว" };
  }

  // N เดือนที่แล้ว / N months ago
  const monthMatch = lower.match(/(\d+)\s*เดือนที่แล้ว|(\d+)\s*months?\s*ago/);
  if (monthMatch) {
    const n = parseInt(monthMatch[1] || monthMatch[2], 10);
    let ty = y;
    let tm = m - n;
    while (tm <= 0) {
      tm += 12;
      ty -= 1;
    }
    const bounds = localMonthBoundsFor(ty, tm, timeZone);
    return { startDate: bounds.start, endDate: bounds.end, consumed: `${n} เดือนที่แล้ว` };
  }

  // N วันที่แล้ว / N days ago
  const dayMatch = lower.match(/(\d+)\s*วันที่แล้ว|(\d+)\s*days?\s*ago/);
  if (dayMatch) {
    const n = parseInt(dayMatch[1] || dayMatch[2], 10);
    const startDay = new Date(now.getTime() - n * 86_400_000);
    const { start } = localDayBounds(startDay, timeZone);
    return { startDate: start, consumed: `${n} วันที่แล้ว` };
  }

  // N ปีที่แล้ว
  const yearMatch = lower.match(/(\d+)\s*ปีที่แล้ว|(\d+)\s*years?\s*ago/);
  if (yearMatch) {
    const n = parseInt(yearMatch[1] || yearMatch[2], 10);
    const bounds = localYearBounds(y - n, timeZone);
    return { startDate: bounds.start, endDate: bounds.end, consumed: `${n} ปีที่แล้ว` };
  }

  return { consumed: "" };
}

/** Detect if text describes a decision (for auto-tagging). */
export function detectDecisionTag(text: string): boolean {
  const decisionPatterns = [
    /เลือก.+เพราะ/,
    /ตัดสินใจ.+เพราะ/,
    /เลือก.+เนื่องจาก/,
    /เลือก.+เหตุผล/,
    /decided to.+because/i,
    /chose.+because/i,
    /เพราะว่า.+เลย.+เลือก/,
    /ได้ข้อสรุปว่า/,
    /สรุปว่า.+ดีกว่า/,
  ];
  return decisionPatterns.some((re) => re.test(text));
}

/** Detect expense-like content (for auto-tagging). */
export function detectExpenseTag(text: string): boolean {
  return /บาท|฿|baht|\d+\s*\/\s*(เดือน|ด\.|ปี|สัปดาห์|ส\.)/.test(text);
}

/** Detect receipt-like content. */
export function detectReceiptTag(text: string): boolean {
  return /ใบเสร็จ|receipt|ยอดรวม|total|vat|invoice/i.test(text);
}

/** Detect travel-related content. */
export function detectTravelTag(text: string): boolean {
  return /บิน|เครื่องบิน|โรงแรม|hotel|flight|เดินทาง|travel|วีซ่า|visa|check-?in|boarding/i.test(text);
}

/**
 * Detect if text explicitly names a project (Gap #5 lightweight fix — no new
 * "projects" table, just a structured `project:<name>` tag reusing the existing
 * flexible `tags` array so memory/todos can later be filtered by project via
 * `recall(userId, q, n, { tag: "project:ชื่อ" })` without a schema migration.
 */
export function detectProjectTag(text: string): boolean {
  return /โปรเจกต์|โปรเจ็กต์|โปรเจค|โครงการ\s*\S|project\s*[:：]|งาน\s*โปรเจกต์|\bproject\b/i.test(text);
}

/**
 * Best-effort extraction of a project name from text, e.g.
 * "โปรเจกต์ เลขา ทำ cron เสร็จแล้ว" → "เลขา", or "project: X" → "x".
 * Returns undefined if no clear name follows the project keyword.
 */
export function extractProjectName(text: string): string | undefined {
  const m = text.match(
    /(?:โปรเจกต์|โปรเจ็กต์|โปรเจค|โครงการ|project)\s*[:：]?\s*([^\s,.!?\n]{2,40}(?:\s+[^\s,.!?\n]+){0,2})/i,
  );
  if (!m) return undefined;
  return m[1].trim().toLowerCase();
}
