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
  | "todo_update"
  | "todo_delete"
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
  | "followup_close" // ปิดเรื่องนี้ได้แล้ว / เรื่องนี้จบแล้ว / ไม่ต้องติดตามแล้ว
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
  | "email_reply" // ตอบเมล / ร่างคำตอบ
  // Phase 10
  | "web_search" // ค้นเว็บ / หาข้อมูลปัจจุบัน / ราคาล่าสุด / ข่าว
  | "meeting_list" // ประชุมล่าสุดเรื่องอะไร / สรุปประชุมทั้งหมด / เคยประชุมเรื่องอะไร
  // Phase 11 — Knowledge Base (owner profile / preferences / standing instructions)
  | "kb_add" // "จำไว้ว่าฉันชื่อ...", "โฮชิจำไว้ว่าเวลานัดอย่าก่อนบ่าย 2"
  | "kb_ask" // "รู้อะไรเกี่ยวกับฉันบ้าง", "ฉันชอบอะไร", "โฮชิจำอะไรได้บ้าง"
  | "kb_forget" // "ลืมข้อ 2", "ลบข้อมูลที่ว่าฉันชอบ...", "ที่จำว่าฉันชื่อ X ผิด ลบออก"
  // Phase 12 — Contact tiers (who matters most). Adapted from secretary-agent.
  | "people_set_tier"; // "ตั้ง คุณแม่ เป็น P1", "คุณสมชายสำคัญที่สุด", "ปรับคนนี้เป็น P4"

export interface Intent {
  action: Action;
  /** ข้อความสาระสำคัญ (เอา time word ออกแล้ว) */
  text: string;
  /** สำหรับ recall — คำค้น */
  query?: string;
  /** สำหรับ todo_done/cancel/update/delete — index 1-based ("ทำอันแรกเสร็จแล้ว") */
  index?: number;
  /** สำหรับ todo_add — 1=ด่วน, 2=ปกติ(default), 3=ไม่รีบ */
  priority?: 1 | 2 | 3;
  /** สำหรับ people_set_tier — ระดับสำคัญของคน (1=สำคัญที่สุด .. 4=ภายนอก/เย็น) */
  tier?: 1 | 2 | 3 | 4;
  raw: string;
}

const SYSTEM = `You are the intent router for a Thai personal secretary chatbot on LINE.
Classify the user's latest message into ONE action.

Actions:
- remember: user ส่งข้อมูลมาให้เก็บ/จด (เช่น "จดไว้", "เก็บไว้", "อย่าลืมว่า", แปะลิงก์, ส่งไฟล์/รูป, อัดเสียง)
- recall: user ถามหาของเก่า / ขุดความจำ ("เมื่อวานบอกอะไร", "เคยส่งลิงก์ X ไหม", "ค้นหา", "ขอไฟล์", "อันที่แล้ว", "ทำไมตอนนั้นเลือก")
- remind: ขอให้ตั้งเตือนในอนาคต ("เตือน X", "พรุ่งนี้บอกฉัน", "อย่าลืม", "เตือนไว้กี่โมง")
- todo_add: เพิ่มงานใน to-do list ("จดงาน", "ต้องทำ X", "เพิ่ม to-do") — ถ้ามีคำบอกความสำคัญ ให้ใส่ priority: "ด่วน/สำคัญมาก/เร่งด่วน"→1, ไม่พูดถึง→2 (ไม่ต้องใส่ field), "ไม่รีบ/ไม่เร่ง/เมื่อไรก็ได้"→3
- todo_list: ดูงานค้าง ("มีงานอะไรบ้าง", "to-do", "ค้างอะไรอยู่")
- todo_done: ทำเสร็จแล้ว ("ทำ X เสร็จแล้ว", "เช็คออกอันแรก", "เสร็จแล้ว")
- todo_cancel: ยกเลิกงาน
- todo_update: แก้งานเดิม เช่น เปลี่ยนชื่อ/เลื่อนวัน/เปลี่ยน priority ("แก้งานที่ 2 เป็น X", "เลื่อนงานแรกไปพรุ่งนี้", "ปรับงานแรกเป็นด่วน") — ระบุ index ถ้ามีเลขอันดับ; ถ้าเป็นการเปลี่ยนชื่อ ให้ text=ชื่อใหม่เท่านั้น; ถ้าแค่เลื่อนวันหรือเปลี่ยน priority ให้ text=""
- todo_delete: ลบงานถาวร ("ลบงานที่ 2", "ลบ todo แรกออก") — ไม่ใช่ยกเลิกแบบเก็บประวัติ
- calendar_add: นัด/ประชุม/กิจกรรม ("นัดหมอ", "ประชุม", "มีนัด", "ลงปฏิทิน")
- calendar_list: ถามตาราง ("พรุ่งนี้มีนัดไหม", "สัปดาห์นี้ว่าไหม")
- briefing: ขอสรุปวันนี้ ("สรุปวันนี้", "วันนี้มีอะไรบ้าง", "เบริฟวันนี้", "สรุปให้หน่อย")
- evening_review: ขอสรุปวันตอนเย็น/ก่อนนอน ("สรุปวันนี้ก่อนนอน", "ทำอะไรไปบ้างวันนี้")
- followup_add: เล่าว่าทำอะไรไปแล้วรอการตอบ หรือรอใครบางอย่าง ("ส่งเมลหา X แล้ว", "รอคุณ A ส่งไฟล์", "ติดตามเรื่อง")
- followup_list: ถามว่ามีอะไรรอติดตาม ("มีอะไรรออยู่", "ติดตามอะไรอยู่ไหม")
- followup_close: ขอปิด/ยกเลิกเรื่องที่ติดตามอยู่ ("ปิดเรื่องแรกได้แล้ว", "เรื่องนี้จบแล้ว ไม่ต้องติดตาม", "ได้ไฟล์แล้ว ปิดได้", "ยกเลิกติดตามอันที่ 2") — ระบุ index ถ้ามีเลขอันดับ
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
- web_search: ต้องใช้ข้อมูลปัจจุบัน/ล่าสุดที่ไม่มีทางรู้จากความรู้ทั่วไป เช่น ราคาหุ้น/ทอง/คริปโตวันนี้, ข่าวล่าสุด, อากาศเมืองอื่นตอนนี้ (ที่ไม่ใช่ location เดิม), ตารางแข่ง/ผลบอลล่าสุด, ราคาสินค้าปัจจุบัน, "หาข้อมูลเรื่อง X ให้หน่อย", "เช็คให้หน่อยว่า X" ที่ต้องอ้างอิงเว็บ
- meeting_list: ขอดูสรุปประชุม/บันทึกการประชุมที่เคยจดไว้ ("ประชุมล่าสุดเรื่องอะไร", "สรุปประชุมทั้งหมด", "เคยประชุมเรื่องอะไรบ้าง", "สรุปประชุมครั้งก่อน")
- kb_add: เจ้าของบอกให้ "จำถาวร" เกี่ยวกับตัวเขาเอง/ความชอบ/คำสั่งประจำ (ไม่ใช่เหตุการณ์ที่เพิ่งเกิด) — โปรไฟล์ ("จำไว้ว่าฉันชื่อ X", "ฉันเป็นวิศวกร", "ฉันอยู่กรุงเทพ"), ความชอบ ("ฉันชอบกาแฟดำ", "ไม่ชอบประชุมเช้า"), คำสั่งประจำ/SOP ("โฮชิ เวลานัดประชุมอย่าก่อนบ่าย 2", "ตอบสั้นๆ พอ", "เรียกฉันว่าพี่"). ต่างจาก remember ตรงที่เป็นข้อเท็จจริงถาวรเกี่ยวกับตัวเจ้าของ/วิธีทำงาน ไม่ใช่ข้อมูล/เหตุการณ์ทั่วไป
- kb_ask: ถามว่าเลขาจำ/รู้อะไรเกี่ยวกับตัวเจ้าของบ้าง ("รู้อะไรเกี่ยวกับฉันบ้าง", "โฮชิจำอะไรได้บ้าง", "ฉันชอบอะไร", "ฉันตั้งกฎอะไรไว้")
- kb_forget: ขอให้ลบ/แก้ข้อมูลถาวรที่จำผิดหรือไม่ใช้แล้ว ("ลืมข้อ 2", "ลบที่จำว่าฉันชอบกาแฟ", "ที่จำว่าฉันชื่อ X ผิด ลบออก", "ไม่ต้องจำแล้วว่า...") — ระบุ index ถ้ามีเลขข้อ ("ข้อ 2"→index 2); ถ้าอ้างถึงเนื้อหา ให้ query=สิ่งที่จะลบ
- people_set_tier: ตั้ง/ปรับระดับความสำคัญของคนที่เจ้าของรู้จัก ("ตั้ง คุณแม่ เป็น P1", "คุณสมชายสำคัญที่สุด", "ปรับคนนี้เป็น P4", "คนนี้ P2") — query=ชื่อคน, tier=ระดับ (1=สำคัญที่สุด/ครอบครัว/เจ้านาย, 2=สัมพันธ์สำคัญ, 3=ทั่วไป, 4=ภายนอก/เย็น)
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
- คำถามทั่วไปที่ตอบจากความรู้ปกติได้ (ไม่ต้องข้อมูลสดจากเว็บ) → chat ไม่ใช่ web_search; ใช้ web_search เฉพาะเมื่อจำเป็นต้องมีข้อมูลปัจจุบัน/เปลี่ยนแปลงบ่อย
- "จำไว้ว่าฉัน..." / "ฉันชอบ..." / "เรียกฉันว่า..." / คำสั่งวิธีทำงานถาวร → kb_add ไม่ใช่ remember; แต่ "จดว่า [เหตุการณ์/ข้อมูลทั่วไป]" → remember. เหตุการณ์ที่เพิ่งเกิด ("เมื่อกี้คุยกับ X") = remember, ข้อเท็จจริงถาวรเกี่ยวกับตัวเจ้าของ = kb_add
- "ลืม.../ลบที่จำว่า.../ไม่ต้องจำแล้วว่า..." ที่อ้างถึงข้อมูลถาวรเกี่ยวกับตัวเจ้าของ → kb_forget ไม่ใช่ delete_recent (delete_recent = ลบ memory/ของที่เพิ่งส่งล่าสุดเท่านั้น)
- การตั้ง/ปรับระดับความสำคัญของคน ("ตั้ง X เป็น P1", "X สำคัญที่สุด", "ปรับ X เป็น P4") → people_set_tier; การถามข้อมูลคน ("X เป็นใคร") → people_ask

Return STRICT JSON: {"action":"...","text":"...","query":"...optional","index":number?,"priority":1|2|3 (optional, only for todo_add/todo_update),"tier":1|2|3|4 (optional, only for people_set_tier)}`;

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
      priority: [1, 2, 3].includes(json.priority) ? (json.priority as 1 | 2 | 3) : undefined,
      tier: [1, 2, 3, 4].includes(json.tier) ? (json.tier as 1 | 2 | 3 | 4) : undefined,
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
    "remember","recall","remind","todo_add","todo_list","todo_done","todo_cancel","todo_update","todo_delete",
    "calendar_add","calendar_list","chat","help","delete_recent",
    "briefing","evening_review","followup_add","followup_list","followup_close","people_ask",
    "expense_add","expense_summary","subscription_add","subscription_list",
    "journal_show","goal_add","goal_log","goal_progress","decision_recall",
    "meeting_prep","travel_checklist",
    "email_summary","email_reply",
    "web_search",
    "meeting_list",
    "kb_add","kb_ask","kb_forget",
    "people_set_tier",
  ].includes(a as string);
}
