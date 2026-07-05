import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { embedOne } = await import("../src/lib/llm/embed");
  const v = await embedOne("ค่าเช่าบ้าน");
  const nonzero = v.filter((x) => x !== 0).length;
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  console.log("dim:", v.length, "nonzero:", nonzero, "magnitude:", mag.toFixed(4));
  console.log("first 10:", v.slice(0, 10));

  // also check DB stored
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await sb.from("memory").select("content, embedding").limit(1);
  if (data && data[0]) {
    const e = typeof data[0].embedding === "string" ? JSON.parse(data[0].embedding) : data[0].embedding;
    const nz = e.filter((x: number) => x !== 0).length;
    const m = Math.sqrt(e.reduce((s: number, x: number) => s + x * x, 0));
    console.log("\nstored:", data[0].content.slice(0, 40));
    console.log("stored dim:", e.length, "nonzero:", nz, "magnitude:", m.toFixed(4));
  }
}
main().catch(console.error);
