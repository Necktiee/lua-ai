import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { embedOne } = await import("../src/lib/llm/embed");

  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const vec = await embedOne("ค่าเช่าเท่าไหร่");
  console.log("vec dim:", vec.length, "sample:", vec.slice(0, 3));

  const vecStr = `[${vec.join(",")}]`;
  const { data, error } = await sb.rpc("match_memory", {
    query_embedding: vecStr,
    query_user: "test-user-smoke",
    match_count: 3,
  });
  console.log("error:", error?.message);
  console.log("raw data:", JSON.stringify(data, null, 2));
}
main().catch(console.error);
