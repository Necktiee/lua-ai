/**
 * LINE Flex Message builders — สร้าง bubble JSON ตาม Messaging API schema
 * มือ hand-roll ตรงกับ pattern ของ src/lib/line.ts (raw fetch, ไม่ใช้ SDK)
 */
import type { LineMessage } from "@/lib/line";

export const FLEX_COLORS = {
  accent: "#10b981", // emerald — ให้ตรงกับ dashboard accent lock
  warn: "#f59e0b",
  danger: "#ef4444",
  muted: "#71717a",
  text: "#18181b",
} as const;

/** ห่อ bubble contents ให้เป็น flex message object พร้อม altText (บังคับโดย LINE) */
export function flexMessage(altText: string, contents: Record<string, unknown>): LineMessage {
  return { type: "flex", altText: altText.slice(0, 400) || "ข้อความ", contents };
}

interface FlexRow {
  text: string;
  sub?: string;
  dotColor?: string;
}

function listBubble(opts: {
  headerText: string;
  headerColor?: string;
  rows: FlexRow[];
  emptyText?: string;
  footerText?: string;
}): Record<string, unknown> {
  const bodyContents: unknown[] = [];
  if (opts.rows.length === 0) {
    bodyContents.push({ type: "text", text: opts.emptyText ?? "ไม่มีข้อมูล", size: "sm", color: FLEX_COLORS.muted });
  } else {
    opts.rows.forEach((row, i) => {
      if (i > 0) bodyContents.push({ type: "separator", margin: "md" });
      bodyContents.push({
        type: "box",
        layout: "horizontal",
        margin: i > 0 ? "md" : "none",
        spacing: "sm",
        contents: [
          ...(row.dotColor
            ? [
                {
                  type: "box",
                  layout: "vertical",
                  width: "8px",
                  height: "8px",
                  cornerRadius: "4px",
                  backgroundColor: row.dotColor,
                  contents: [],
                },
              ]
            : []),
          {
            type: "box",
            layout: "vertical",
            contents: [
              { type: "text", text: row.text.slice(0, 200), size: "sm", wrap: true, color: FLEX_COLORS.text },
              ...(row.sub ? [{ type: "text", text: row.sub.slice(0, 120), size: "xxs", color: FLEX_COLORS.muted, margin: "xs" }] : []),
            ],
          },
        ],
      });
    });
  }

  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: opts.headerColor ?? FLEX_COLORS.accent,
      paddingAll: "16px",
      contents: [{ type: "text", text: opts.headerText.slice(0, 60), color: "#ffffff", weight: "bold", size: "md" }],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      contents: bodyContents,
    },
    ...(opts.footerText
      ? {
          footer: {
            type: "box",
            layout: "vertical",
            paddingAll: "12px",
            contents: [{ type: "text", text: opts.footerText.slice(0, 200), size: "xs", color: FLEX_COLORS.muted, wrap: true }],
          },
        }
      : {}),
  };
}

/** งานค้าง (todo_list) — จุดสีตาม priority + วันครบกำหนด */
export function buildTodoListFlex(
  todos: Array<{ title: string; due_at?: string | null; priority: number }>,
  fmtDate: (iso: string) => string,
): LineMessage {
  const rows: FlexRow[] = todos.slice(0, 10).map((t) => ({
    text: t.title,
    sub: t.due_at ? fmtDate(t.due_at) : undefined,
    dotColor: t.priority === 1 ? FLEX_COLORS.danger : t.priority === 3 ? "#a1a1aa" : FLEX_COLORS.warn,
  }));
  const footer = todos.length > 10 ? `และอีก ${todos.length - 10} รายการ` : undefined;
  const contents = listBubble({ headerText: `งานค้าง (${todos.length})`, rows, footerText: footer });
  return flexMessage(`งานค้าง ${todos.length} รายการ`, contents);
}

/** นัดในปฏิทิน (calendar_list) */
export function buildCalendarFlex(
  events: Array<{ summary: string; when: string; location?: string }>,
  headerText: string,
): LineMessage {
  const rows: FlexRow[] = events.slice(0, 10).map((e) => ({
    text: e.summary,
    sub: [e.when, e.location].filter(Boolean).join(" · "),
  }));
  const contents = listBubble({ headerText, rows });
  return flexMessage(headerText, contents);
}

/** การ์ดข้อความเดียว (calendar_add ยืนยัน, briefing, evening_review) */
export function buildTextCardFlex(headerText: string, bodyText: string, headerColor?: string): LineMessage {
  const contents = {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: headerColor ?? FLEX_COLORS.accent,
      paddingAll: "16px",
      contents: [{ type: "text", text: headerText.slice(0, 60), color: "#ffffff", weight: "bold", size: "md" }],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      contents: [{ type: "text", text: bodyText.slice(0, 2000) || "-", size: "sm", wrap: true, color: FLEX_COLORS.text }],
    },
  };
  return flexMessage(headerText, contents);
}

/** วิธีใช้งาน (help) — แยกเป็น section หัวข้อ + บรรทัดคำสั่ง */
export function buildHelpFlex(sections: Array<{ title: string; lines: string[] }>): LineMessage {
  const bodyContents: unknown[] = [];
  sections.forEach((s, i) => {
    if (i > 0) bodyContents.push({ type: "separator", margin: "lg" });
    bodyContents.push({
      type: "text",
      text: s.title,
      weight: "bold",
      size: "sm",
      color: FLEX_COLORS.accent,
      margin: i > 0 ? "lg" : "none",
    });
    s.lines.forEach((line) =>
      bodyContents.push({ type: "text", text: line, size: "xs", color: "#3f3f46", wrap: true, margin: "xs" }),
    );
  });
  const contents = {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: FLEX_COLORS.accent,
      paddingAll: "16px",
      contents: [{ type: "text", text: "โฮชิพร้อมช่วย", color: "#ffffff", weight: "bold", size: "md" }],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      spacing: "xs",
      contents: bodyContents,
    },
  };
  return flexMessage("โฮชิพร้อมช่วย — วิธีใช้งาน", contents);
}
