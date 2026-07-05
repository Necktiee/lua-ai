/**
 * Multimodal — ใช้ Gemini REST API สำหรับ:
 * - transcribeAudio: แปลงเสียงเป็นข้อความ (Thai-first)
 * - describeImage: อธิบายรูปเป็นข้อความ (เพื่อ embed + search)
 *
 * ใช้ round-robin key เหมือน pool (สุ่ม key ต่อ request).
 */
import { env } from "@/lib/env";
import { LLMError } from "@/lib/llm/types";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-2.5-flash";

function pickKey(): string {
  const keys = env.GEMINI_API_KEYS;
  if (keys.length === 0) throw new LLMError("no gemini keys for multimodal", "no_keys");
  return keys[Math.floor(Math.random() * keys.length)];
}

async function callGemini(
  prompt: string,
  mime: string,
  base64Data: string,
): Promise<string> {
  const key = pickKey();
  const url = `${BASE}/${MODEL}:generateContent`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mime, data: base64Data } },
          ],
        }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new LLMError(`gemini multimodal ${res.status}: ${errText.slice(0, 200)}`, "bad_response");
    }
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string" || !text.trim()) {
      throw new LLMError("gemini multimodal empty response", "bad_response");
    }
    return text.trim();
  } finally {
    clearTimeout(t);
  }
}

/** แปลง ArrayBuffer เป็น base64 (Buffer avoids spread stack limits on large audio) */
function toBase64(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString("base64");
}

/** Normalize LINE audio mime → Gemini-compatible mime */
function normalizeAudioMime(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes("m4a") || ct.includes("mp4") || ct.includes("aac")) return "audio/mp4";
  if (ct.includes("mpeg") || ct.includes("mp3")) return "audio/mpeg";
  if (ct.includes("ogg")) return "audio/ogg";
  if (ct.includes("wav")) return "audio/wav";
  return "audio/mp4";
}

/** Normalize image mime */
function normalizeImageMime(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes("png")) return "image/png";
  if (ct.includes("gif")) return "image/gif";
  if (ct.includes("webp")) return "image/webp";
  return "image/jpeg";
}

export async function transcribeAudio(
  buffer: ArrayBuffer,
  contentType: string,
): Promise<string> {
  const mime = normalizeAudioMime(contentType);
  const b64 = toBase64(buffer);
  return callGemini(
    "ถอดเสียงเป็นข้อความภาษาไทย (ถ้าเป็นภาษาอังกฤษก็ถอดตามที่พูด). เขียนเป็นข้อความสั้นกระชับ ไม่ต้องใส่คำอธิบาย.",
    mime,
    b64,
  );
}

export async function describeImage(
  buffer: ArrayBuffer,
  contentType: string,
  userText?: string,
): Promise<string> {
  const mime = normalizeImageMime(contentType);
  const b64 = toBase64(buffer);
  const extra = userText ? ` บริบทจากผู้ใช้: "${userText}"` : "";
  return callGemini(
    `อธิบายรูปนี้เป็นภาษาไทยสั้นๆ 1-2 ประโยค เน้นสาระสำคัญ (ใคร อะไร ที่ไหน ข้อความในรูป).${extra}`,
    mime,
    b64,
  );
}
