/**
 * Embeddings สำหรับ semantic memory search.
 * ใช้ provider ตาม LLM_EMBEDDING_PROVIDER.
 */
import OpenAI from "openai";
import { env } from "@/lib/env";
import { allProviders } from "./providers";
import { isAvailable, markCall, markCooldown } from "./rate";
import type { ProviderName } from "./types";
import { LLMError } from "./types";

const clients = new Map<string, OpenAI>();
function getClient(baseURL: string, apiKey: string): OpenAI {
  const key = `${baseURL}:${apiKey.slice(-4)}`;
  let c = clients.get(key);
  if (!c) {
    c = new OpenAI({ baseURL, apiKey });
    clients.set(key, c);
  }
  return c;
}

export async function embed(
  texts: string[],
  providerOverride?: ProviderName,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const name = providerOverride ?? env.LLM_EMBEDDING_PROVIDER;
  const cfg = allProviders().find((p) => p.name === name);
  if (!cfg || cfg.keys.length === 0) {
    throw new LLMError(
      `no keys for embedding provider ${name}`,
      "no_keys",
    );
  }

  const start = Math.floor(Math.random() * cfg.keys.length);
  let lastErr: unknown;
  for (let i = 0; i < cfg.keys.length; i++) {
    const keyIdx = (start + i) % cfg.keys.length;
    if (!isAvailable(cfg.name, keyIdx, cfg.rpmPerKey, cfg.rpdPerKey)) continue;
    try {
      const client = getClient(cfg.baseURL, cfg.keys[keyIdx]);
      const controller = new AbortController();
      const timeoutMs = 60_000;
      const t = setTimeout(() => controller.abort(), timeoutMs);
      let res;
      try {
        res = await client.embeddings.create(
          {
            model: cfg.embedModel,
            input: texts,
          },
          { signal: controller.signal },
        );
      } finally {
        clearTimeout(t);
      }
      markCall(cfg.name, keyIdx);
      return res.data.map((d) => d.embedding);
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number }).status;
      const retryable =
        status === 429 ||
        status === 403 ||
        status === 408 ||
        (status != null && status >= 500);
      if (retryable) {
        markCooldown(cfg.name, keyIdx, status === 429 || status === 403 ? 60_000 : 15_000);
        continue;
      }
      throw err;
    }
  }
  throw new LLMError(
    `embedding all keys exhausted: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
    "all_keys_exhausted",
    lastErr,
  );
}

export async function embedOne(
  text: string,
  providerOverride?: ProviderName,
): Promise<number[]> {
  const [v] = await embed([text], providerOverride);
  if (!v) throw new LLMError("empty embedding result", "bad_response");
  return v;
}
