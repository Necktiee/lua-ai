/**
 * Knowledge parser — turn a natural "จำไว้ว่า..." message into a structured
 * KB fact { category, key, value, priority }.
 *
 * Examples:
 *   "จำไว้ว่าฉันชื่อจริงคือ เนคไท"          → profile / ชื่อจริง / เนคไท
 *   "โฮชิ จำไว้ว่าฉันเป็น dev สาย backend"   → profile / อาชีพ / dev สาย backend
 *   "จำไว้ว่าเวลานัดประชุมอย่าก่อนบ่าย 2"     → sop / เวลานัดประชุม / อย่าก่อนบ่าย 2
 *   "จำไว้ว่าฉันชอบกาแฟดำไม่ใส่น้ำตาล"        → preference / เครื่องดื่มที่ชอบ / กาแฟดำไม่ใส่น้ำตาล
 *   "จำไว้ว่าแม่ชื่อสมศรี เกิด 3 พ.ค."        → relationship / แม่ / ชื่อสมศรี เกิด 3 พ.ค.
 *
 * Mirrors the resilient parse pattern in expense/parse.ts: LLM call wrapped in
 * try/catch (provider failure → null, never throws), lite model, JSON output
 * validated against the allowed category set + priority range.
 */
import { chat } from "@/lib/llm/pool";
import type { KnowledgeRecord } from "@/lib/types";

export interface ParsedKnowledge {
  category: KnowledgeRecord["category"];
  key: string;
  value: string;
  priority: 1 | 2 | 3;
}

const VALID_CATEGORIES: KnowledgeRecord["category"][] = [
  "profile",
  "preference",
  "sop",
  "relationship",
  "context",
];

export async function parseKnowledge(
  text: string,
): Promise<ParsedKnowledge | null> {
  let res;
  try {
    res = await chat({
      messages: [
        {
          role: "system",
          content: `แยกข้อเท็จจริงที่เจ้าของสั่งให้เลขา "จำไว้" ออกเป็น JSON:
{"category":"profile|preference|sop|relationship|context","key":"หัวข้อสั้น","value":"เนื้อหา","priority":1|2|3}

category:
- profile = ข้อมูลตัวตนเจ้าของ (ชื่อจริง, อาชีพ, ที่อยู่, วันเกิด, บริษัท)
- preference = ความชอบ/สไตล์ (อาหาร, เครื่องดื่ม, วิธีทำงาน, โทนการตอบ)
- sop = คำสั่งประจำที่ต้องปฏิบัติเสมอ (เช่น "อย่านัดก่อนบ่าย 2", "สรุปเป็น bullet เสมอ")
- relationship = ข้อมูลคนสำคัญ (แม่, หัวหน้า, แฟน, เพื่อนร่วมงาน)
- context = บริบทงาน/โปรเจกต์ที่ควรรู้ทั่วไป

key = หัวข้อสั้นกระชับ (เช่น "ชื่อจริง", "อาชีพ", "เวลานัดประชุม", "แม่")
value = เนื้อหาจริง เก็บรายละเอียดครบ (ชื่อ, ตัวเลข, วันที่)
priority: 1 = สำคัญมากต้องรู้ทุกครั้ง (ชื่อ, อาชีพ, คำสั่งประจำ) ; 2 = ปกติ (default) ; 3 = รู้ไว้เฉยๆ ดึงเฉพาะเมื่อเกี่ยวข้อง
- profile และ sop มักเป็น priority 1
- ถ้าไม่มีข้อเท็จจริงให้จำจริงๆ (เป็นคำถามหรือคุยเล่น) ตอบ {"error":true}`,
        },
        { role: "user", content: text },
      ],
      options: { lite: true, temperature: 0, maxOutputTokens: 200 },
    });
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(res.text.replace(/```json|```/g, "").trim());
    if (parsed.error) return null;

    const category = VALID_CATEGORIES.includes(parsed.category)
      ? (parsed.category as KnowledgeRecord["category"])
      : "context";
    const key =
      typeof parsed.key === "string" && parsed.key.trim()
        ? parsed.key.trim().slice(0, 120)
        : "";
    const value =
      typeof parsed.value === "string" && parsed.value.trim()
        ? parsed.value.trim().slice(0, 2000)
        : "";
    if (!key || !value) return null;

    const priority = [1, 2, 3].includes(parsed.priority)
      ? (parsed.priority as 1 | 2 | 3)
      : category === "profile" || category === "sop"
        ? 1
        : 2;

    return { category, key, value, priority };
  } catch {
    return null;
  }
}
