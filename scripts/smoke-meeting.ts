import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { handle } = await import("../src/lib/agent/handle");
  const { requireDb } = await import("../src/lib/db/client");
  const UID = "test-user-meeting";

  // cleanup
  const db = requireDb();
  await db.from("memory").delete().eq("user_id", UID);
  await db.from("users").delete().eq("line_user_id", UID);

  const cases: Array<{ label: string; text: string }> = [
    { label: "save meeting (thai full)", text: `สรุปประชุม วันที่ 5 ก.ค. 67 เรื่องโครงการเว็บใหม่
ผู้เข้าประชุม: คุณสมชาย, คุณมาลี, ผม
วาระที่ 1: timeline การส่งมอบ — ตกลงส่งภายใน 30 ก.ค.
มติที่ประชุม: เริ่ม development สัปดาห์หน้า ใช้ Next.js
action items: ผมส่ง spec ให้ทีมพฤหัสนี้` },
    { label: "save meeting (short thai)", text: "บันทึกการประชุม: ประชุมงานขาย — ยอด Q3 ต้องการ 20M" },
    { label: "save meeting (english)", text: "Meeting notes 2024-01-15: discussed Q4 roadmap with team" },
    { label: "save non-meeting (control)", text: "จดไว้ ซื้อกาแฟ 50 บาท" },
    { label: "meeting_list recent", text: "ประชุมล่าสุดเรื่องอะไรบ้าง" },
    { label: "meeting_list all", text: "สรุปประชุมทั้งหมด" },
    { label: "meeting_list topic", text: "เคยประชุมเรื่องขายไหม" },
  ];

  for (const c of cases) {
    process.stdout.write(`\n[${c.label}]\n→ `);
    try {
      const reply = await handle({ userId: UID, text: c.text });
      const out = typeof reply === "string" ? reply : reply.text;
      console.log(out.slice(0, 400) + (out.length > 400 ? "..." : ""));
    } catch (e) {
      console.log("ERR:", (e as Error).message);
    }
  }
}
main().catch(console.error);
