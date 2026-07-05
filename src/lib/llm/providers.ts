import { env } from "@/lib/env";
import type { ProviderConfig, ProviderName } from "./types";

const ALL: ProviderName[] = ["gemini", "mistral", "openrouter", "thaillm"];

/**
 * รวบ provider configs จาก env. keys แบ่งด้วย comma.
 */
export function getProviderConfig(name: ProviderName): ProviderConfig {
  switch (name) {
    case "gemini":
      return {
        name: "gemini",
        baseURL: env.GEMINI_BASE_URL,
        chatModel: env.GEMINI_MODEL,
        liteModel: env.GEMINI_MODEL_LITE,
        embedModel: env.LLM_EMBEDDING_MODEL,
        keys: env.GEMINI_API_KEYS,
        rpmPerKey: 10,
        rpdPerKey: 1500,
      };
    case "mistral":
      return {
        name: "mistral",
        baseURL: env.MISTRAL_BASE_URL,
        chatModel: env.MISTRAL_MODEL,
        // NOTE: mistral-embed ถูก deprecate และคืน zero-vector แล้ว — ใช้ gemini แทน
        embedModel: env.LLM_EMBEDDING_MODEL,
        keys: env.MISTRAL_API_KEYS,
        rpmPerKey: 60,
        rpdPerKey: null,
      };
    case "thaillm":
      return {
        name: "thaillm",
        baseURL: env.THAILLM_BASE_URL,
        chatModel: env.THAILLM_MODEL,
        // ThaiLLM ไม่ใช่ OpenAI-compatible โดยตรง — ต้อง proxy ผ่าน LiteLLM
        // https://www.somkiat.cc/hello-thaillm/
        embedModel: env.LLM_EMBEDDING_MODEL,
        keys: env.THAILLM_API_KEYS,
        rpmPerKey: 200,
        rpdPerKey: null,
      };
    case "openrouter":
      return {
        name: "openrouter",
        baseURL: env.OPENROUTER_BASE_URL,
        chatModel: env.OPENROUTER_CHAT_MODEL,
        embedModel: env.OPENROUTER_EMBEDDING_MODEL,
        keys: env.OPENROUTER_API_KEYS,
        rpmPerKey: 60,
        rpdPerKey: null,
      };
  }
}

export function allProviders(): ProviderConfig[] {
  return ALL.map(getProviderConfig).filter((p) => p.keys.length > 0);
}

/** providers ตาม fallback order (เฉพาะ chat) */
export function chatFallbackOrder(): ProviderConfig[] {
  const order = env.LLM_FALLBACK_ORDER.length
    ? (env.LLM_FALLBACK_ORDER.filter((x) =>
        ["gemini", "mistral", "thaillm", "openrouter"].includes(x),
      ) as ProviderName[])
    : (["gemini", "mistral"] as ProviderName[]);
  return order
    .map(getProviderConfig)
    .filter((p) => p.keys.length > 0);
}
