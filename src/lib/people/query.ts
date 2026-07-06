/**
 * People query — answer "John เป็นใคร" by combining people record + memory mentions.
 */
import { findPerson, getMentionsForPerson } from "@/lib/people/repo";
import { recall } from "@/lib/memory/store";
import { BANGKOK } from "@/lib/tz";

export async function askAboutPerson(userId: string, query: string): Promise<string> {
  // Extract the name from query
  const cleaned = query
    .replace(/เป็นใคร|เป็นยังไง|ชอบอะไร|ชื่ออะไร|คือใคร|เกี่ยวกับ|คนที่|คนที่ชื่อ/g, "")
    .replace(/คุณ|Mr\.|Mrs\.|Ms\./gi, "")
    .trim();

  if (!cleaned) return "ถามแบบไหนดี? เช่น 'John เป็นใคร' หรือ 'คุณ A ชอบอะไร'";

  const person = await findPerson(userId, cleaned);

  if (!person) {
    // fallback: semantic search in memory
    const results = await recall(userId, cleaned, 5);
    if (results.length === 0) {
      return `ไม่เคยจดเรื่อง "${cleaned}" เลย 🤔`;
    }
    return "เจอในความจำ (แต่ไม่ได้บันทึกเป็นคน):\n" +
      results.map((r) => `• ${new Date(r.memory.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: BANGKOK })} — ${r.memory.content.slice(0, 100)}`).join("\n");
  }

  // Build profile from notes + mentions
  const mentions = await getMentionsForPerson(person.id, 5);
  const memoryResults = await recall(userId, person.name, 8);

  const lines: string[] = [];
  lines.push(`👤 ${person.name}`);

  // notes
  const notes = person.notes ?? {};
  const noteKeys = Object.keys(notes).filter((k) => notes[k] != null && notes[k] !== "");
  if (noteKeys.length > 0) {
    for (const key of noteKeys.slice(0, 6)) {
      lines.push(`• ${key}: ${String(notes[key])}`);
    }
  }

  // last seen
  if (person.last_seen) {
    lines.push(`• พบล่าสุด: ${new Date(person.last_seen).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: BANGKOK })}`);
  }

  // mentions count
  if (mentions.length > 0) {
    lines.push(`• ปรากฏในบันทึก ${mentions.length} ครั้ง`);
  }

  // related memories
  if (memoryResults.length > 0) {
    lines.push("\nเกริ่นเกี่ยวกับเขา:");
    // recall() already enforces a minimum similarity floor centrally.
    for (const r of memoryResults.slice(0, 4)) {
      lines.push(`• ${new Date(r.memory.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: BANGKOK })} — ${r.memory.content.slice(0, 120)}`);
    }
  }

  return lines.join("\n");
}
