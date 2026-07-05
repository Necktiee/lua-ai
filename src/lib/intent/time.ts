/**
 * Time parser — แปลงภาษาไทยธรรมชาติเป็น ISO 8601 (Asia/Bangkok).
 * ใช้ LLM เพราะ chrono-node ไม่เก่งไทย ("พรุ่งนี้ 9 โมง", "ศุกร์หน้า 5 โมงเย็น").
 */
import { chat } from "@/lib/llm/pool";
import { BANGKOK } from "@/lib/tz";

export async function parseTimes(
  text: string,
  now: Date = new Date(),
  timeZone: string = BANGKOK,
): Promise<{ startIso: string | null; endIso: string | null; restText: string }> {
  const sys = `You parse Thai/English natural time expressions to ISO 8601 (${timeZone}).
Today is ${now.toISOString()} (${timeZone}).
Return JSON only: {"start": "ISO" | null, "end": "ISO" | null, "rest": "remaining text without time words"}
Rules:
- 9 โมง = 09:00 today, บ่ายโมง = 13:00, 5 โมงเย็น = 17:00, เที่ยงคืน = 00:00 next day
- พรุ่งนี้/มะรืน = tomorrow/day after, สัปดาห์หน้า = +7d, ศุกร์หน้า = next Friday
- If only date no time → start = that date 09:00
- If no time expression → start=null end=null rest=original
- "rest" = original text minus the time words only, keep the meaning`;

  const userMsg = `Parse: ${JSON.stringify(text)}`;
  const raw = await chat({
    messages: [
      { role: "system", content: sys },
      { role: "user", content: userMsg },
    ],
    options: { lite: true, temperature: 0, timeoutMs: 20_000 },
  });

  try {
    const json = JSON.parse(raw.text.replace(/```json|```/g, "").trim());
    return {
      startIso: typeof json.start === "string" ? json.start : null,
      endIso: typeof json.end === "string" ? json.end : null,
      restText: typeof json.rest === "string" ? json.rest.trim() : text,
    };
  } catch {
    return { startIso: null, endIso: null, restText: text };
  }
}
