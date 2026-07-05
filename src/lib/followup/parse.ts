/**
 * Follow-up parser — extract subject, waiting_for, deadline from natural language.
 * "ส่งเมลหา CEO แล้ว" → { subject: "ส่งเมลหา CEO", waitingFor: undefined }
 * "รอคุณ A ส่งไฟล์ deadline ศุกร์" → { subject: "รอไฟล์", waitingFor: "คุณ A", deadline: ... }
 */
import { chat } from "@/lib/llm/pool";
import { parseTimes } from "@/lib/intent/time";

export interface ParsedFollowUp {
  subject: string;
  waitingFor?: string;
  deadline?: string;
}

export async function parseFollowUp(text: string, timeZone?: string): Promise<ParsedFollowUp> {
  const res = await chat({
    messages: [
      {
        role: "system",
        content: `แยกข้อมูล follow-up จากข้อความภาษาไทย ออกมาเป็น JSON เท่านั้น:
{
  "subject": "หัวข้อที่ติดตาม (สั้น)",
  "waiting_for": "ชื่อคน/สิ่งที่รอ หรือ null ถ้าไม่ได้รอใคร",
  "deadline_text": "คำบอกเวลาในข้อความ เช่น 'ศุกร์' '3 วัน' หรือ null"
}
ตัวอย่าง: "รอคุณ A ส่งไฟล์ศุกร์นี้" → {"subject":"ไฟล์จากคุณ A","waiting_for":"คุณ A","deadline_text":"ศุกร์นี้"}`,
      },
      { role: "user", content: text },
    ],
    options: { lite: true, temperature: 0, maxOutputTokens: 150 },
  });

  let parsed: { subject?: string; waiting_for?: string | null; deadline_text?: string | null };
  try {
    parsed = JSON.parse(res.text.replace(/```json|```/g, "").trim());
  } catch {
    return { subject: text.slice(0, 100) };
  }

  let deadline: string | undefined;
  if (parsed.deadline_text) {
    try {
      const { startIso } = await parseTimes(parsed.deadline_text, new Date(), timeZone);
      deadline = startIso ?? undefined;
    } catch {
      // ignore parse error
    }
  }

  const waitingFor =
    typeof parsed.waiting_for === "string" &&
    parsed.waiting_for.trim() &&
    parsed.waiting_for.toLowerCase() !== "null"
      ? parsed.waiting_for.trim()
      : undefined;

  return {
    subject: parsed.subject?.trim() || text.slice(0, 100),
    waitingFor,
    deadline,
  };
}
