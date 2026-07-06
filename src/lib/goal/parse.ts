/**
 * Goal parser — extract goal info from natural language.
 * "ตั้งเป้า เรียนภาษา 45 นาที/วัน" → { title, target, unit, period }
 * "วันนี้เรียนภาษา 30 นาที" → { titleHint, value, unit }
 */
import { chat } from "@/lib/llm/pool";

export interface ParsedGoal {
  title: string;
  target?: number;
  unit?: string;
  period: "daily" | "weekly" | "monthly";
}

export async function parseGoal(text: string): Promise<ParsedGoal | null> {
  let res;
  try {
    res = await chat({
      messages: [
        {
          role: "system",
          content: `แยกข้อมูลเป้าหมายจากข้อความไทย เป็น JSON:
{"title": "ชื่อเป้าหมาย", "target": number หรือ null, "unit": "หน่วย เช่น นาที กม. หน้า", "period": "daily|weekly|monthly"}
- ถ้ามี "/วัน" หรือ "ต่อวัน" → period=daily
- ถ้ามี "/สัปดาห์" หรือ "ต่อสัปดาห์" → period=weekly
- ถ้ามี "/เดือน" → period=monthly
- default period=daily
- ถ้าไม่มีตัวเลข target ตอบ null`,
        },
        { role: "user", content: text },
      ],
      options: { lite: true, temperature: 0, maxOutputTokens: 150 },
    });
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(res.text.replace(/```json|```/g, "").trim());
    const period = ["daily", "weekly", "monthly"].includes(parsed.period) ? parsed.period : "daily";
    const title = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : null;
    if (!title) return null;
    const target = parsed.target != null ? Number(parsed.target) : undefined;
    const unit = typeof parsed.unit === "string" && parsed.unit !== "null" ? parsed.unit : undefined;
    return {
      title,
      target: Number.isFinite(target) ? target : undefined,
      unit,
      period: period as "daily" | "weekly" | "monthly",
    };
  } catch {
    return null;
  }
}

export interface ParsedGoalLog {
  titleHint?: string;
  value: number;
  unit?: string;
  note?: string;
}

export async function parseGoalLog(text: string): Promise<ParsedGoalLog | null> {
  let res;
  try {
    res = await chat({
      messages: [
        {
          role: "system",
          content: `แยกข้อมูลการบันทึกความคืบหน้าเป้าหมายจากข้อความไทย เป็น JSON:
{"title_hint": "คำเชื่อมโยงเป้าหมาย เช่น ภาษา วิ่ง อ่าน หรือ null", "value": number, "unit": "หน่วย หรือ null", "note": "หมายเหตุ หรือ null"}
- value เป็นตัวเลขเท่านั้น
- ถ้าไม่มีตัวเลข ตอบ {"error": true}`,
        },
        { role: "user", content: text },
      ],
      options: { lite: true, temperature: 0, maxOutputTokens: 150 },
    });
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(res.text.replace(/```json|```/g, "").trim());
    if (parsed.error) return null;
    const value = Number(parsed.value);
    if (!Number.isFinite(value) || value < 0) return null;
    return {
      titleHint: typeof parsed.title_hint === "string" && parsed.title_hint !== "null" ? parsed.title_hint : undefined,
      value,
      unit: typeof parsed.unit === "string" && parsed.unit !== "null" ? parsed.unit : undefined,
      note: typeof parsed.note === "string" && parsed.note !== "null" ? parsed.note : undefined,
    };
  } catch {
    return null;
  }
}
