/**
 * Optional live routing eval — calls LLM classify when keys are present.
 * Usage: npx tsx scripts/eval-routing-live.ts
 * Exit 1 if accuracy < 0.80 (soft gate for live smoke).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classify } from "../src/lib/intent/router";

interface Case {
  id: string;
  text: string;
  expect: string;
}

async function main() {
  const keys =
    (process.env.GEMINI_API_KEYS || "") +
    (process.env.OPENROUTER_API_KEYS || "") +
    (process.env.MISTRAL_API_KEYS || "");
  if (!keys.trim()) {
    console.log("LIVE ROUTING EVAL SKIPPED — no LLM API keys");
    process.exit(0);
  }

  const cases = JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "evals", "routing.json"), "utf8"),
  ) as Case[];

  let ok = 0;
  const misses: string[] = [];
  for (const c of cases) {
    try {
      const intent = await classify(c.text);
      if (intent.action === c.expect) {
        ok++;
        console.log(`✓ ${c.id} ${c.expect}`);
      } else {
        misses.push(`${c.id}: got ${intent.action}, want ${c.expect}`);
        console.log(`✗ ${c.id}: got ${intent.action}, want ${c.expect}`);
      }
    } catch (e) {
      misses.push(`${c.id}: error ${(e as Error).message}`);
      console.log(`✗ ${c.id}: ${(e as Error).message}`);
    }
  }

  const acc = ok / cases.length;
  console.log(`\nAccuracy: ${(acc * 100).toFixed(1)}% (${ok}/${cases.length})`);
  if (misses.length) console.log("Misses:\n" + misses.join("\n"));
  if (acc < 0.8) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
