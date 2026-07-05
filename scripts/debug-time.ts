import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { parseTimes } = await import("../src/lib/intent/time");
  const tests = [
    "พรุ่งนี้ 9 โมงเช้า",
    "พรุ่งนี้ 9 โมง",
    "tomorrow 9am",
    "ศุกร์หน้า 5 โมงเย็น",
    "โทรหาแม่พรุ่งนี้ 9 โมงเช้า",
    "ส่งรายงานวันศุกร์ 17:00",
  ];
  for (const t of tests) {
    const r = await parseTimes(t);
    console.log(`"${t}" → start=${r.startIso} end=${r.endIso} rest="${r.restText}"`);
  }
}
main().catch(console.error);
