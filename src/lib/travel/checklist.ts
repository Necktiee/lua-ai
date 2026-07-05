/**
 * Travel Assistant — สร้าง checklist สำหรับการเดินทาง (feature #11).
 * Detect travel-related memory → generate checklist via LLM.
 */
import { recall } from "@/lib/memory/store";
import { chat } from "@/lib/llm/pool";

export async function generateTravelChecklist(userId: string, travelContext: string): Promise<string> {
  // Recall travel-related memories
  const results = await recall(userId, `เดินทาง บิน โรงแรม ${travelContext}`, 5);

  const lines: string[] = [];
  lines.push(`✈️ เตรียมเดินทาง: ${travelContext}\n`);

  // LLM generate checklist
  try {
    const ctx = {
      destination: travelContext,
      relatedMemories: results.slice(0, 3).map((r) => r.memory.content.slice(0, 100)),
    };
    const res = await chat({
      messages: [
        {
          role: "system",
          content: `สร้าง checklist สำหรับการเดินทางเป็นภาษาไทย มีหมวด:
• เอกสาร (Passport, Boarding Pass, วีซ่า)
• ของใช้ (Powerbank, เครื่องชาร์จ, ยา)
• ก่อนออกเดินทาง (Check-in, แจ้งธนาคาร, สำรองไฟ)

ขึ้นตั้งแต่ละหมวดด้วยหัวข้อ และ item ในหมวดด้วย "☐ ". สั้นกระชับ.`,
        },
        { role: "user", content: JSON.stringify(ctx) },
      ],
      options: { temperature: 0.4, maxOutputTokens: 400 },
    });
    if (res.text?.trim()) {
      lines.push(res.text.trim());
    } else {
      lines.push(defaultChecklist());
    }
  } catch (e) {
    console.warn("[travel] LLM failed", (e as Error).message);
    lines.push(defaultChecklist());
  }

  // Related memories
  if (results.length > 0) {
    lines.push(`\n📝 ที่เคยจดเกี่ยวกับทริปนี้`);
    for (const r of results.slice(0, 3)) {
      if (r.similarity < 0.3) continue;
      const date = new Date(r.memory.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
      lines.push(`• ${date} — ${r.memory.content.slice(0, 100)}`);
    }
  }

  return lines.join("\n");
}

function defaultChecklist(): string {
  return `เอกสาร
☐ Passport
☐ Boarding Pass
☐ วีซ่า (ถ้าต้องการ)

ของใช้
☐ Powerbank
☐ เครื่องชาร์จ + สาย
☐ ยาส่วนตัว
☐ เสื้อผ้าตามจำนวนวัน

ก่อนออกเดินทาง
☐ Check-in ออนไลน์
☐ แจ้งธนาคาร (ถ้าใช้บัตรต่างประเทศ)
☐ สำรองแบตเตอรี่โทรศัพท์`;
}
