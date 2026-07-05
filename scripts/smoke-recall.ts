/**
 * Regression test for the recall() correctness fix:
 * 1. Tag filtering must happen inside the SQL RPC so it returns ALL matching
 *    tagged memories, not just whichever ones happened to rank in an
 *    unfiltered top-N window (undercount bug).
 * 2. A minimum similarity floor must reject novel/unrelated queries instead
 *    of confidently returning the closest-but-irrelevant memories.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { remember, recall } = await import("../src/lib/memory/store");
  const { requireDb } = await import("../src/lib/db/client");
  const UID = "test-user-recall-fix";

  const db = requireDb();
  await db.from("memory").delete().eq("user_id", UID);
  await db.from("users").delete().eq("line_user_id", UID);
  await db.from("users").insert({ line_user_id: UID, display_name: "smoke" });

  console.log("--- seeding memories ---");
  // 3 memories tagged "project:alpha".
  await remember({ userId: UID, kind: "text", content: "โปรเจกต์ alpha: ต้องส่งรายงานสัปดาห์นี้ทุกวันศุกร์", tags: ["project:alpha"] });
  await remember({ userId: UID, kind: "text", content: "โปรเจกต์ alpha: งบประมาณอนุมัติแล้ว 500000 บาท", tags: ["project:alpha"] });
  await remember({ userId: UID, kind: "text", content: "โปรเจกต์ alpha: ทีมมี 4 คน นำโดยคุณสมชาย", tags: ["project:alpha"] });
  // 10 unrelated, untagged filler memories.
  const fillers = [
    "ซื้อกาแฟที่ร้านประจำ 50 บาท",
    "นัดหมอฟันวันพฤหัส บ่าย 2 โมง",
    "อ่านหนังสือเล่มใหม่ได้ครึ่งเล่มแล้ว",
    "ไปตัดผมที่ร้านเดิม",
    "ซื้อของใช้ที่ซุปเปอร์มาร์เก็ต",
    "ดูหนังกับเพื่อนเมื่อวาน",
    "ออกกำลังกายตอนเช้า 30 นาที",
    "จ่ายค่าน้ำค่าไฟเดือนนี้แล้ว",
    "ทำความสะอาดบ้านช่วงสุดสัปดาห์",
    "โทรหาคุณแม่เมื่อคืน",
  ];
  for (const f of fillers) {
    await remember({ userId: UID, kind: "text", content: f });
  }

  let ok = true;

  console.log("--- test 1: tag filter returns all 3 tagged memories, not fewer ---");
  const tagged = await recall(UID, "โปรเจกต์ alpha ความคืบหน้า", 5, { tag: "project:alpha" });
  console.log(`got ${tagged.length} results (expect 3)`);
  for (const r of tagged) console.log(`  sim=${r.similarity.toFixed(3)} tags=${r.memory.tags} — ${r.memory.content.slice(0, 50)}`);
  console.log(tagged.length === 3 ? "PASS" : "FAIL");
  ok = ok && tagged.length === 3;

  console.log("\n--- test 2: min-similarity floor rejects a novel/unrelated query ---");
  const novel = await recall(UID, "ยานอวกาศสำรวจดาวอังคารความเร็วแสง", 5);
  console.log(`got ${novel.length} results`);
  for (const r of novel) console.log(`  sim=${r.similarity.toFixed(3)} — ${r.memory.content.slice(0, 50)}`);
  const allAboveFloor = novel.every((r) => r.similarity >= 0.3);
  console.log(allAboveFloor ? "PASS (no result below floor leaked through)" : "FAIL (leaked low-similarity result)");
  ok = ok && allAboveFloor;

  console.log("\n--- test 3: relevant query still returns real matches ---");
  const relevant = await recall(UID, "งบประมาณโปรเจกต์ alpha เท่าไหร่", 3);
  console.log(`got ${relevant.length} results`);
  for (const r of relevant) console.log(`  sim=${r.similarity.toFixed(3)} — ${r.memory.content.slice(0, 50)}`);
  console.log(relevant.length > 0 ? "PASS" : "FAIL");
  ok = ok && relevant.length > 0;

  await db.from("memory").delete().eq("user_id", UID);
  await db.from("users").delete().eq("line_user_id", UID);

  console.log(ok ? "\nALL PASS" : "\nSOME FAILED");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
