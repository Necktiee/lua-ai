/** smoke test — ยิงแต่ละ provider ที ดูว่า keys ใช้ได้ */
import { config } from "dotenv";
config({ path: ".env.local" });

import OpenAI from "openai";

const GEMINI_KEYS = (process.env.GEMINI_API_KEYS || "").split(",").filter(Boolean);
const MISTRAL_KEYS = (process.env.MISTRAL_API_KEYS || "").split(",").filter(Boolean);
const THAILLM_KEYS = (process.env.THAILLM_API_KEYS || "").split(",").filter(Boolean);

async function tryOne(name: string, baseURL: string, key: string, model: string) {
  const client = new OpenAI({ baseURL, apiKey: key });
  const started = Date.now();
  try {
    const res = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "Reply in one short Thai sentence." },
        { role: "user", content: "สวัสดี" },
      ],
      max_tokens: 100,
    });
    const text = res.choices?.[0]?.message?.content ?? "(empty)";
    console.log(`✓ ${name} (${model}) [${Date.now() - started}ms]: ${text.slice(0, 120)}`);
    return true;
  } catch (e) {
    const status = (e as { status?: number }).status;
    console.log(`✗ ${name} (${model}) status=${status} ${(e as Error).message.slice(0, 160)}`);
    return false;
  }
}

async function main() {
  console.log("=== gemini ===");
  if (GEMINI_KEYS[0]) {
    await tryOne("gemini[0]", "https://generativelanguage.googleapis.com/v1beta/openai", GEMINI_KEYS[0], "gemini-2.5-flash");
    await tryOne("gemini-lite", "https://generativelanguage.googleapis.com/v1beta/openai", GEMINI_KEYS[0], "gemini-2.5-flash-lite");
  } else console.log("no gemini keys");

  console.log("\n=== mistral ===");
  if (MISTRAL_KEYS[0]) {
    await tryOne("mistral[0]", "https://api.mistral.ai/v1", MISTRAL_KEYS[0], "mistral-small-latest");
  } else console.log("no mistral keys");

  console.log("\n=== thaillm ===");
  if (THAILLM_KEYS[0]) {
    // ลอง endpoint 2 แบบ
    await tryOne("thaillm(openthaigpt)", "https://api.openthaigpt.org/v1", THAILLM_KEYS[0], "openthaigpt-1.0.0-8b-chat");
  } else console.log("no thaillm keys");

  console.log("\n=== gemini embedding ===");
  try {
    const c = new OpenAI({ baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: GEMINI_KEYS[0] });
    const r = await c.embeddings.create({ model: "text-embedding-004", input: ["hello", "สวัสดี"] });
    console.log(`✓ embed dim=${r.data[0].embedding.length}`);
  } catch (e) {
    console.log(`✗ embed: ${(e as Error).message.slice(0, 160)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
