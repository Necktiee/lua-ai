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

/** งานค้าง (todo_list) — จุดสีตาม priority + วันครบกำหนด + ปุ่มทำเสร็จ/ยกเลิก */
export function buildTodoListFlex(
  todos: Array<{ id: string; title: string; due_at?: string | null; priority: number }>,
  fmtDate: (iso: string) => string,
): LineMessage {
  if (todos.length === 0) {
    return flexMessage("ไม่มีงานค้าง", listBubble({ headerText: "งานค้าง (0)", rows: [] }));
  }
  const bubbles = todos.slice(0, 10).map((t) => {
    const dotColor = t.priority === 1 ? FLEX_COLORS.danger : t.priority === 3 ? "#a1a1aa" : FLEX_COLORS.warn;
    return {
      type: "bubble" as const,
      header: {
        type: "box" as const,
        layout: "vertical" as const,
        backgroundColor: FLEX_COLORS.accent,
        paddingAll: "12px",
        contents: [
          {
            type: "box" as const,
            layout: "horizontal" as const,
            contents: [
              { type: "box" as const, layout: "vertical" as const, width: "8px", height: "8px", cornerRadius: "4px", backgroundColor: dotColor, contents: [] },
              { type: "text" as const, text: t.title.slice(0, 80), color: "#ffffff", weight: "bold", size: "sm", flex: 1 },
            ],
            spacing: "sm",
          },
        ],
      },
      body: {
        type: "box" as const,
        layout: "vertical" as const,
        paddingAll: "12px",
        contents: [
          ...(t.due_at ? [{ type: "text" as const, text: fmtDate(t.due_at), size: "xs", color: FLEX_COLORS.muted }] : []),
        ],
      },
      footer: {
        type: "box" as const,
        layout: "horizontal" as const,
        spacing: "sm",
        contents: [
          {
            type: "button" as const,
            style: "primary",
            color: "#10b981",
            action: { type: "postback", label: "✅ ทำเสร็จ", data: `todo_done=${t.id}` },
          },
          {
            type: "button" as const,
            style: "secondary",
            action: { type: "postback", label: "🚫 ยกเลิก", data: `todo_cancel=${t.id}` },
          },
        ],
      },
    };
  });
  return flexMessage(
    `งานค้าง ${todos.length} รายการ`,
    bubbles.length === 1 ? bubbles[0] : { type: "carousel", contents: bubbles },
  );
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

/** Follow-up list with close buttons */
export function buildFollowUpListFlex(
  followups: Array<{ id: string; subject: string; waitingFor?: string | null; ageDays: number }>,
): LineMessage {
  if (followups.length === 0) {
    return flexMessage("ไม่มีเรื่องติดตาม", listBubble({ headerText: "ติดตาม (0)", rows: [] }));
  }
  const bubbles = followups.slice(0, 10).map((f) => ({
    type: "bubble" as const,
    header: {
      type: "box" as const,
      layout: "vertical" as const,
      backgroundColor: FLEX_COLORS.warn,
      paddingAll: "12px",
      contents: [{ type: "text" as const, text: f.subject.slice(0, 80), color: "#ffffff", weight: "bold", size: "sm" }],
    },
    body: {
      type: "box" as const,
      layout: "vertical" as const,
      paddingAll: "12px",
      contents: [
        ...(f.waitingFor ? [{ type: "text" as const, text: `รอ: ${f.waitingFor.slice(0, 100)}`, size: "xs", color: FLEX_COLORS.text, wrap: true }] : []),
        { type: "text" as const, text: `${f.ageDays} วันที่แล้ว`, size: "xxs", color: FLEX_COLORS.muted, margin: "xs" },
      ],
    },
    footer: {
      type: "box" as const,
      layout: "horizontal" as const,
      contents: [
        {
          type: "button" as const,
          style: "primary",
          color: "#10b981",
          action: { type: "postback", label: "✅ ปิด", data: `followup_close=${f.id}` },
        },
      ],
    },
  }));
  return flexMessage(
    `ติดตาม ${followups.length} เรื่อง`,
    bubbles.length === 1 ? bubbles[0] : { type: "carousel", contents: bubbles },
  );
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
      contents: [{ type: "text", text: "แจ๋วพร้อมช่วย", color: "#ffffff", weight: "bold", size: "md" }],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      spacing: "xs",
      contents: bodyContents,
    },
  };
  return flexMessage("แจ๋วพร้อมช่วย — วิธีใช้งาน", contents);
}
