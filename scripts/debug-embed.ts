import { config } from "dotenv";
config({ path: ".env.local" });
import OpenAI from "openai";

async function main() {
  const key = process.env.MISTRAL_API_KEYS!.split(",")[0];
  console.log("key suffix:", key.slice(-6));
  const c = new OpenAI({ baseURL: "https://api.mistral.ai/v1", apiKey: key });

  for (const text of ["ค่าเช่าบ้าน", "rent payment", "hello world"]) {
    const r = await c.embeddings.create({
      model: "mistral-embed",
      input: [text],
    });
    const v = r.data[0].embedding;
    const nz = v.filter((x) => x !== 0).length;
    const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    console.log(`"${text}": dim=${v.length} nonzero=${nz} mag=${mag.toFixed(3)}`);
    if (nz === 0) {
      // full dump first row
      console.log("  API raw response:", JSON.stringify(r).slice(0, 500));
    }
  }
}
main().catch(console.error);
