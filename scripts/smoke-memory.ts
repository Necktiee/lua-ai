import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { remember, recall, listRecent } = await import("../src/lib/memory/store");
  const { requireDb } = await import("../src/lib/db/client");
  const UID = "test-user-smoke";

  // cleanup previous test data
  const db = requireDb();
  await db.from("memory").delete().eq("user_id", UID);
  await db.from("users").delete().eq("line_user_id", UID);

  console.log("insert 3 memories...");
  await remember({ userId: UID, kind: "text", content: "ค่าเช่าบ้านเดือน มิ.ย. โอน 8500 บาท วันที่ 3" });
  await remember({ userId: UID, kind: "text", content: "ไอเดียทำแอปเลขาส่วนตัวบน LINE สำหรับคนขี้ลืม" });
  await remember({ userId: UID, kind: "link", content: "https://abdul-ai.com/ — เว็บอับดุลเลขา LINE อ้างอิง" });

  console.log("\nrecent:");
  for (const m of await listRecent(UID, 5)) {
    console.log(" -", m.kind, "|", m.content.slice(0, 70));
  }

  console.log("\nsearch 1: 'ค่าเช่าเท่าไหร่'...");
  for (const r of await recall(UID, "ค่าเช่าเท่าไหร่", 2)) {
    console.log(`  [${r.similarity.toFixed(3)}]`, r.memory.content.slice(0, 70));
  }

  console.log("\nsearch 2: 'link เว็บเลขา'...");
  for (const r of await recall(UID, "link เว็บเลขาที่อ้างอิง", 2)) {
    console.log(`  [${r.similarity.toFixed(3)}]`, r.memory.content.slice(0, 70));
  }
  console.log("\n✓ done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
