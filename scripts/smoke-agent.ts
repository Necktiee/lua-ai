import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { handle } = await import("../src/lib/agent/handle");
  const { requireDb } = await import("../src/lib/db/client");
  const UID = "test-user-agent";

  // cleanup previous test data
  const db = requireDb();
  await db.from("messages").delete().eq("user_id", UID);
  await db.from("memory").delete().eq("user_id", UID);
  await db.from("todos").delete().eq("user_id", UID);
  await db.from("reminders").delete().eq("user_id", UID);
  await db.from("users").delete().eq("line_user_id", UID);

  const cases: Array<{ label: string; text: string }> = [
    { label: "remember text", text: "จดไว้: เบอร์แม่ 089-123-4567" },
    { label: "remember link", text: "https://github.com/vercel/next.js อ่าน later" },
    { label: "recall", text: "เบอร์แม่เท่าไหร่นะ" },
    { label: "todo add", text: "จดงาน: ส่งใบเสร็จให้ลูกค้า" },
    { label: "todo list", text: "มีงานค้างไหม" },
    { label: "remind future", text: "เตือนโทรหาแม่พรุ่งนี้ 9 โมงเช้า" },
    { label: "chat qa", text: "ต้มไข่กี่นาทีได้ยางมะตูม" },
    { label: "help", text: "ทำอะไรได้บ้าง" },
  ];

  for (const c of cases) {
    process.stdout.write(`\n[${c.label}] "${c.text}"\n→ `);
    try {
      const reply = await handle({ userId: UID, text: c.text });
      console.log(reply);
    } catch (e) {
      console.log("ERR:", (e as Error).message);
    }
  }
}
main().catch(console.error);
