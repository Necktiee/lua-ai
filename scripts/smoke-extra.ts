import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { handle } = await import("../src/lib/agent/handle");
  const UID = "test-user-extra";

  const cases: Array<{ label: string; text: string }> = [
    { label: "expense add", text: "ซื้อกาแฟ 85 บาท" },
    { label: "expense summary", text: "เดือนนี้ใช้เท่าไร" },
    { label: "followup add", text: "ส่งเมลหาคุณสมชายแล้วรอตอบ" },
    { label: "followup list", text: "มีอะไรรอติดตามไหม" },
    { label: "goal add", text: "ตั้งเป้า เรียนภาษาอังกฤษ 30 นาทีทุกวัน" },
    { label: "goal log", text: "วันนี้เรียนภาษาอังกฤษ 25 นาที" },
    { label: "goal progress", text: "เป้าคืบหน้ายัง" },
    { label: "web search", text: "ราคาทองวันนี้เท่าไร" },
    { label: "calendar list (no Google)", text: "ปฏิทินสัปดาห์นี้" },
    { label: "subscription add", text: "สมัคร Spotify 199บาท/เดือน" },
    { label: "decision recall empty", text: "ทำไมเลือกใช้ Next.js" },
    { label: "people ask empty", text: "สมชายเป็นใคร" },
  ];

  for (const c of cases) {
    process.stdout.write(`\n[${c.label}] "${c.text}"\n→ `);
    try {
      const reply = await handle({ userId: UID, text: c.text });
      const out = typeof reply === "string" ? reply : reply.text;
      console.log(out.slice(0, 300) + (out.length > 300 ? "..." : ""));
    } catch (e) {
      console.log("ERR:", (e as Error).message);
    }
  }
}
main().catch(console.error);
