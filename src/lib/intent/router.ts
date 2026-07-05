/**
 * Intent classifier — ดูข้อความ user แล้วเลือก action.
 * ใช้ LLM lite model + structured JSON output.
 */
import { chat } from "@/lib/llm/pool";
import type { ChatTurn } from "@/lib/llm/types";

export type Action =
  | "remember" // จดข้อมูลเข้าคลัง
  | "recall" // ค้นความจำเก่า
  | "remind" // ตั้งเตือน
  | "todo_add"
  | "todo_list"
  | "todo_done"
  | "todo_cancel"
  | "calendar_add"
  | "calendar_list"
  | "chat" // คุยทั่วไป
  | "help"
  | "delete_recent" // ลบความทรงจำล่าสุด
  // Phase 2
  | "briefing" // สรุปวันนี้ / สรุปให้หน่อย
  | "evening_review" // สรุปวันนี้ก่อนนอน
  // Phase 3
  | "followup_add" // ส่งเมลหา CEO แล้ว / รอคุณ A ส่งไฟล์
  | "followup_list" // มีอะไรรอติดตามไหม
  // Phase 4
  | "people_ask" // John เป็นใคร / คุณ A เป็นยังไง
  // Phase 5
  | "expense_add" // ซื้อกาแฟ 85 / ใช้เงินไป 500
  | "expense_summary" // เดือนนี้ใช้เท่าไร / สรุปค่าใช้จ่าย
  | "subscription_add" // สมัคร Netflix 199/เดือน
  | "subscription_list" // มี subscription อะไรบ้าง
  // Phase 8
  | "journal_show" // โชว์ journal / ไดอารี่วันนี้
  | "goal_add" // ตั้งเป้า เรียนภาษา 45 นาที/วัน
  | "goal_log" // วันนี้เรียนภาษา 30 นาที
  | "goal_progress" // เป้าคืบหน้ายัง
  // Phase 6
  | "decision_recall" // ทำไมเลือก X / เหตุผลที่ตัดสินใจ
  // Phase 7
  | "meeting_prep" // เตรียมประชุม / ประชุมถัดไป
  | "travel_checklist" // checklist เดินทาง / บินพรุ่งนี้
  // Phase 9
  | "email_summary" // สรุปเมล / inbox
  | "email_reply"; // ตอบเมล / ร่างคำตอบ

export interface Intent {
  action: Action;
  /** ข้อความสาระสำคัญ (เอา time word ออกแล้ว) */
  text: string;
  /** สำหรับ recall — คำค้น */
  query?: string;
  /** สำหรับ todo_done/cancel — index 1-based ("ทำอันแรกเสร็จแล้ว") */
  index?: number;
  raw: string;
}

const SYSTEM = `You are the intent router for a Thai personal secretary chatbot on LINE.
Classify the user's latest message into ONE action.

Actions:
- remember: user ส่งข้อมูลมาให้เก็บ/จด (เช่น "จดไว้", "เก็บไว้", "อย่าลืมว่า", แปะลิงก์, ส่งไฟล์/รูป, อัดเสียง)
- recall: user ถามหาของเก่า / ขุดความจำ ("เมื่อวานบอกอะไร", "เคยส่งลิงก์ X ไหม", "ค้นหา", "ขอไฟล์", "อันที่แล้ว", "ทำไมตอนนั้นเลือก")
- remind: ขอให้ตั้งเตือนในอนาคต ("เตือน X", "พรุ่งนี้บอกฉัน", "อย่าลืม", "เตือนไว้กี่โมง")
- todo_add: เพิ่มงานใน to-do list ("จดงาน", "ต้องทำ X", "เพิ่ม to-do")
- todo_list: ดูงานค้าง ("มีงานอะไรบ้าง", "to-do", "ค้างอะไรอยู่")
- todo_done: ทำเสร็จแล้ว ("ทำ X เสร็จแล้ว", "เช็คออกอันแรก", "เสร็จแล้ว")
- todo_cancel: ยกเลิกงาน
- calendar_add: นัด/ประชุม/กิจกรรม ("นัดหมอ", "ประชุม", "มีนัด", "ลงปฏิทิน")
- calendar_list: ถามตาราง ("พรุ่งนี้มีนัดไหม", "สัปดาห์นี้ว่าไหม")
- briefing: ขอสรุปวันนี้ ("สรุปวันนี้", "วันนี้มีอะไรบ้าง", "เบริฟวันนี้", "สรุปให้หน่อย")
- evening_review: ขอสรุปวันตอนเย็น/ก่อนนอน ("สรุปวันนี้ก่อนนอน", "ทำอะไรไปบ้างวันนี้")
- followup_add: เล่าว่าทำอะไรไปแล้วรอการตอบ หรือรอใครบางอย่าง ("ส่งเมลหา X แล้ว", "รอคุณ A ส่งไฟล์", "ติดตามเรื่อง")
- followup_list: ถามว่ามีอะไรรอติดตาม ("มีอะไรรออยู่", "ติดตามอะไรอยู่ไหม")
- people_ask: ถามเกี่ยวกับคน ("John เป็นใคร", "คุณ A ชอบอะไร", "คนที่ประชุมครั้งก่อน")
- expense_add: บันทึกค่าใช้จ่าย ("ซื้อกาแฟ 85", "ใช้ไป 500", "จ่ายค่า 500 บาท")
- expense_summary: สรุปค่าใช้จ่าย ("เดือนนี้ใช้เท่าไร", "สรุปค่าใช้จ่าย", "ใช้ไปเท่าไรสัปดาห์นี้")
- subscription_add: สมัคร/เพิ่ม subscription ("สมัคร Netflix 199", "เพิ่ม Adobe 1500/เดือน")
- subscription_list: ดู subscription ("มี subscription อะไรบ้าง", "จ่ายค่าสมัครอะไรบ้าง")
- journal_show: ขอดูไดอารี่/journal ("โชว์ journal", "ไดอารี่วันนี้", "วันนี้ทำอะไร")
- goal_add: ตั้งเป้าหมาย ("ตั้งเป้า เรียนภาษา 45 นาที/วัน", "เป้าหมายใหม่")
- goal_log: บันทึกความคืบหน้าเป้าหมาย ("วันนี้เรียนภาษา 30 นาที", "วิ่งไป 5 กม.")
- goal_progress: ถามความคืบหน้าเป้าหมาย ("เป้าคืบหน้ายัง", "ก้าวเท่าไรแล้ว")
- decision_recall: ถามเหตุผลการตัดสินใจ ("ทำไมเลือก X", "เหตุผลที่ตัดสินใจ", "ทำไมตอนนั้นเลือก")
- meeting_prep: ขอเตรียมตัวประชุม ("เตรียมประชุม", "ประชุมถัดไปพูดอะไร", "brief ประชุม")
- travel_checklist: ขอ checklist เดินทาง ("บินพรุ่งนี้", "checklist เดินทาง", "เตรียมตัวไป", "ไปเชียงใหม่ต้องเตรียมอะไร")
- email_summary: ขอสรุปอีเมล ("สรุปเมล", "inbox", "มีเมลอะไรบ้าง", "เช็คเมล")
- email_reply: ขอให้ร่างคำตอบเมล ("ตอบเมล", "ร่างคำตอบ", "ช่วยตอบเมลนี้")
- chat: คุยทั่วไป / ถามคำถาม / ไม่เข้ากรณีข้างต้น
- help: ถามว่าทำได้อะไร / ใช้ยังไง
- delete_recent: ขอลบของล่าสุดที่ส่งมา ("ลบที่พึ่งส่ง", "เอาออก")

Notes:
- "อย่าลืม" อาจเป็น remember OR remind ดู context — ถ้ามีเวลา = remind, ไม่มี = remember
- ถ้า user ส่งแค่ลิงก์/ไฟล์/รูป/เสียง (ไม่มีข้อความ) → action=remember
- ตัดคำสั่งออกจาก text (เช่น "เตือนฉัน" / "จดไว้") เก็บเฉพาะสาระ
- "สรุปวันนี้" ไม่มีเวลากำกับ (เช้า/เย็น) → action=briefing
- "รอ X" หรือ "ส่ง X ไปแล้ว" → followup_add
- ถ้ามีตัวเลข + หน่วยเงิน (บาท/฿) และคำว่า ซื้อ/จ่าย/ใช้ไป → expense_add; ถ้ามี "จด" หรือ "เก็บไว้" → remember แม้มีราคา
- ถ้าถาม "เป็นใคร/ชอบอะไร/เป็นยังไง" + ชื่อคน → people_ask
- "ทำไมเลือก/ตัดสินใจ/เหตุผลที่" + สิ่งที่เลือก → decision_recall

Return STRICT JSON: {"action":"...","text":"...","query":"...optional","index":number?}`;

export async function classify(
  userText: string,
  history: ChatTurn[] = [],
  hasAttachment = false,
): Promise<Intent> {
  if (!userText.trim() && hasAttachment) {
    return { action: "remember", text: "", raw: "" };
  }

  const recent = history.slice(-6).map((m) => `${m.role}: ${m.content}`).join("\n");
  const userMsg = `Conversation so far:\n${recent || "(none)"}\n\nClassify this latest message:\n${JSON.stringify(userText)}`;

  const res = await chat({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userMsg },
    ],
    options: { lite: true, temperature: 0, timeoutMs: 20_000 },
  });

  try {
    const json = JSON.parse(res.text.replace(/```json|```/g, "").trim());
    const intent: Intent = {
      action: validAction(json.action) ? json.action : "chat",
      text: typeof json.text === "string" ? json.text : userText,
      query: typeof json.query === "string" ? json.query : undefined,
      index: typeof json.index === "number" ? json.index : undefined,
      raw: userText,
    };
    return applyRememberOverride(intent, userText);
  } catch {
    return { action: "chat", text: userText, raw: userText };
  }
}

/** "จด: ..." / "จดไว้ ..." should remember, not expense_add — unless "จดงาน" (todo). */
function applyRememberOverride(intent: Intent, userText: string): Intent {
  const t = userText.trim();
  if (/^จดงาน/i.test(t)) return intent;
  if (/^(จด|จดไว้|จดว่า|เก็บไว้|บันทึก)(:|：|\s)/i.test(t)) {
    if (intent.action === "expense_add" || intent.action === "chat") {
      return { ...intent, action: "remember" };
    }
  }
  return intent;
}

function validAction(a: unknown): a is Action {
  return [
    "remember","recall","remind","todo_add","todo_list","todo_done","todo_cancel",
    "calendar_add","calendar_list","chat","help","delete_recent",
    "briefing","evening_review","followup_add","followup_list","people_ask",
    "expense_add","expense_summary","subscription_add","subscription_list",
    "journal_show","goal_add","goal_log","goal_progress","decision_recall",
    "meeting_prep","travel_checklist",
    "email_summary","email_reply",
  ].includes(a as string);
}
