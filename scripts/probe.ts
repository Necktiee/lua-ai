import { config } from "dotenv";
config({ path: ".env.local" });
import OpenAI from "openai";

async function main() {
  const key = process.env.THAILLM_API_KEYS!.split(",")[0];
  console.log("=== thaillm tries ===");
  for (const base of [
    "https://api.aieat.or.th/v1",
    "https://api.thaillm.or.th/v1",
  ]) {
    try {
      const c = new OpenAI({ baseURL: base, apiKey: key, maxRetries: 0, timeout: 8000 });
      const r = await c.chat.completions.create({
        model: "openthaigpt-1.0.0-8b-chat",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 30,
      });
      console.log("✓", base, r.choices[0].message.content?.slice(0, 80));
    } catch (e: unknown) {
      console.log("✗", base, (e as { status?: number }).status || "?", ((e as Error).message || "").slice(0, 120));
    }
  }

  console.log("\n=== gemini embedding models ===");
  const gkey = process.env.GEMINI_API_KEYS!.split(",")[0];
  for (const m of ["text-embedding-004", "gemini-embedding-001", "embedding-001"]) {
    try {
      const c = new OpenAI({
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
        apiKey: gkey,
      });
      const r = await c.embeddings.create({ model: m, input: ["test"] });
      console.log("✓", m, "dim=", r.data[0].embedding.length);
    } catch (e: unknown) {
      console.log("✗", m, ((e as Error).message || "").slice(0, 140));
    }
  }

  console.log("\n=== mistral embed ===");
  try {
    const mkey = process.env.MISTRAL_API_KEYS!.split(",")[0];
    const c = new OpenAI({ baseURL: "https://api.mistral.ai/v1", apiKey: mkey });
    const r = await c.embeddings.create({ model: "mistral-embed", input: ["test"] });
    console.log("✓ mistral-embed dim=", r.data[0].embedding.length);
  } catch (e: unknown) {
    console.log("✗", ((e as Error).message || "").slice(0, 140));
  }
}

main().catch(console.error);
