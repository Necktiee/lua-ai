/**
 * Strip reasoning/thinking tags และ meta เพื่อเอาแค่คำตอบสุดท้าย.
 * - <thinking>...</thinking> (gemini, mistral think)
 * - <think>...</think> (deepseek-style)
 * - # internal monologue บาง model
 * - <|...|> control tokens
 */
const BLOCK_TAGS = ["think", "thinking", "reasoning", "reflection"];

export function stripReasoning(input: string): string {
  let out = input;
  for (const tag of BLOCK_TAGS) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi");
    out = out.replace(re, "");
  }
  // self-closing หรือ unclosed — ตตตต cut ตั้งแต่ <think> ถึงท้าย
  out = out.replace(/<(?:think|thinking)\b[^>]*>[\s\S]*$/i, "");
  // control tokens
  out = out.replace(/<\|[^|]*\|>/g, "");
  return out.trim();
}

/** แยก "เหตุผล" ออกจาก "คำตอบ" — คืน { reasoning, answer } */
export function splitReasoning(input: string): {
  reasoning: string;
  answer: string;
} {
  let reasoning = "";
  let answer = input;
  for (const tag of BLOCK_TAGS) {
    const re = new RegExp(
      `<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`,
      "i",
    );
    const m = input.match(re);
    if (m) {
      reasoning = m[1].trim();
      answer = input.replace(re, "").trim();
      break;
    }
  }
  if (!reasoning) answer = stripReasoning(answer);
  return { reasoning, answer: answer || stripReasoning(input) };
}
