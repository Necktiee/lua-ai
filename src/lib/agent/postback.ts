/**
 * LINE Flex postback dispatcher — handles structured button taps.
 *
 * Postback data convention: `action=value` (URL-safe, no JSON).
 * Examples:
 *   todo_done=<uuid>
 *   followup_close=<uuid>
 *   remind_cancel=<uuid>
 *
 * Postbacks flow through mutation idempotency (claimMutation) since
 * LINE may redeliver events. The webhookEventId from the postback event
 * serves as the idempotency key.
 */
import { setStatus } from "@/lib/todo/repo";
import { closeFollowUp } from "@/lib/followup/repo";
import { cancelReminder } from "@/lib/remind/schedule";
import { touchUser } from "@/lib/db/client";

export interface PostbackResult {
  text: string;
}

export function parsePostbackData(data: string): { action: string; value: string } | null {
  const eq = data.indexOf("=");
  if (eq < 0) return null;
  return { action: data.slice(0, eq).trim(), value: data.slice(eq + 1).trim() };
}

export async function handlePostback(
  userId: string,
  data: string,
  webhookEventId?: string,
): Promise<PostbackResult> {
  await touchUser(userId);
  const parsed = parsePostbackData(data);
  if (!parsed) return { text: "ไม่เข้าใจคำสั่ง" };

  const { action, value } = parsed;

  switch (action) {
    case "todo_done": {
      const { claimMutation } = await import("@/lib/idempotency/mutation");
      const dup = await claimMutation({ userId, webhookEventId, action: "todo_done", target: value });
      if (dup === "duplicate") return { text: "ทำเสร็จไปแล้ว ✅" };
      const todo = await setStatus(userId, value, "done");
      if (todo) return { text: `ทำเสร็จ ✅ "${todo.title}"` };
      return { text: "ไม่พบงานนี้แล้ว" };
    }

    case "todo_cancel": {
      const { claimMutation } = await import("@/lib/idempotency/mutation");
      const dup = await claimMutation({ userId, webhookEventId, action: "todo_cancel", target: value });
      if (dup === "duplicate") return { text: "ยกเลิกไปแล้ว" };
      const ok = await setStatus(userId, value, "cancelled");
      return { text: ok ? `ยกเลิกแล้ว 🚫` : "ไม่พบงานนี้" };
    }

    case "followup_close": {
      const { claimMutation } = await import("@/lib/idempotency/mutation");
      const dup = await claimMutation({ userId, webhookEventId, action: "followup_close", target: value });
      if (dup === "duplicate") return { text: "ปิดไปแล้ว ✅" };
      const ok = await closeFollowUp(userId, value);
      return { text: ok ? `ปิดติดตามแล้ว ✅` : "ไม่พบเรื่องนี้" };
    }

    case "remind_cancel": {
      const { claimMutation } = await import("@/lib/idempotency/mutation");
      const dup = await claimMutation({ userId, webhookEventId, action: "remind_cancel", target: value });
      if (dup === "duplicate") return { text: "ยกเลิกไปแล้ว" };
      const ok = await cancelReminder(value);
      return { text: ok ? `ยกเลิกการเตือนแล้ว ❌` : "ไม่พบการเตือนนี้" };
    }

    default:
      return { text: "ไม่รู้จัคำสั่งนี้" };
  }
}
