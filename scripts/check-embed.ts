import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await sb.from("memory").select("id, kind, content, embedding").limit(5);
  if (error) {
    console.log("err", error.message);
    return;
  }
  for (const r of data) {
    console.log(
      "row:",
      r.kind,
      "| content:",
      r.content.slice(0, 40),
      "| has embedding:",
      !!r.embedding,
      "| dim:",
      Array.isArray(r.embedding) ? r.embedding.length : typeof r.embedding,
    );
  }
}
main().catch(console.error);
