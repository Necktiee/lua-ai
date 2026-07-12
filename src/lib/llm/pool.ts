/**
 * LLM pool — round-robin per provider + cross-provider fallback.
 *
 * Flow:
 *   1. ไล่ตาม fallback order
 *   2. ในแต่ละ provider: หา key ที่ available (ไม่โดน cooldown ไม่เกิน rpm/rpd)
 *      เริ่มจาก keyIdx = random (stateless serverless-friendly)
 *      ลองตามรอบจนกว่าจะหมด
 *   3. ยิงจริง — ถ้า 429/5xx → markCooldown แล้วลอง key ถัดไป
 *   4. ครบทุก provider → throw LLMError
 */
import OpenAI from "openai";
import { chatFallbackOrder, getProviderConfig } from "./providers";
import {
  isAvailable,
  markCall,
  markCooldown,
} from "./rate";
import {
  splitReasoning,
  stripReasoning,
} from "./parse";
import type {
  ChatOptions,
  ChatResult,
  ChatTurn,
  ProviderConfig,
} from "./types";
import { LLMError } from "./types";
import { recordUsage } from "./usage";

const clients = new Map<string, OpenAI>();
function getClient(cfg: ProviderConfig, apiKey: string): OpenAI {
  const key = `${cfg.name}:${apiKey.slice(-4)}`;
  let c = clients.get(key);
  if (!c) {
    c = new OpenAI({
      baseURL: cfg.baseURL,
      apiKey,
      // timeout ตั้งที่ request-level
    });
    clients.set(key, c);
  }
  return c;
}

export interface ChatRequest {
  messages: ChatTurn[];
  options?: ChatOptions;
}

export async function chat({
  messages,
  options = {},
}: ChatRequest): Promise<ChatResult> {
  const startedAt = Date.now();

  try {
    const { assertUnderCostCap } = await import("./cost-cap");
    const cap = await assertUnderCostCap();
    if (!cap.ok) {
      throw new LLMError(
        `daily cost hard cap exceeded ($${cap.total.toFixed(4)})`,
        "cost_cap",
      );
    }
  } catch (e) {
    if (e instanceof LLMError) throw e;
    // DB unavailable in unit tests — skip cap
  }

  let attempts = 0;
  let lastErr: unknown;

  let cfgs = chatFallbackOrder();
  if (options.provider) {
    const primary = getProviderConfig(options.provider);
    if (primary.keys.length > 0) {
      cfgs = [primary, ...cfgs.filter((c) => c.name !== options.provider)];
    }
  }

  for (const cfg of cfgs) {
    if (cfg.keys.length === 0) continue;

    const { isProviderAvailable, recordSuccess, recordFailure } = await import("./circuit-breaker");
    if (!isProviderAvailable(cfg.name)) {
      lastErr = new LLMError(`circuit open for ${cfg.name}`, "all_keys_exhausted");
      continue;
    }

    const start = Math.floor(Math.random() * cfg.keys.length);
    for (let i = 0; i < cfg.keys.length; i++) {
      const keyIdx = (start + i) % cfg.keys.length;
      if (!isAvailable(cfg.name, keyIdx, cfg.rpmPerKey, cfg.rpdPerKey)) continue;

        attempts++;
        try {
          const { text, usage } = await callOnce(cfg, keyIdx, messages, options);
          markCall(cfg.name, keyIdx);
          recordSuccess(cfg.name);
          const model = options.lite && cfg.liteModel ? cfg.liteModel : cfg.chatModel;
        const elapsedMs = Date.now() - startedAt;
        recordUsage({
          provider: cfg.name,
          model,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          elapsedMs,
          attempts,
          traceId: options.traceId,
        });
        return {
          text,
          provider: cfg.name,
          model,
          keyIndex: keyIdx,
          attempts,
          elapsedMs,
        };
      } catch (err) {
        lastErr = err;
        recordFailure(cfg.name, (err as Error)?.message);
        const status = (err as { status?: number }).status;
        // 429, 403 (gemini ส่งตอน quota), 408 หรือ 5xx → retry key ถัดไป
        const retryable =
          status === 429 ||
          status === 403 ||
          status === 408 ||
          (status != null && status >= 500);
        if (retryable) {
          markCooldown(cfg.name, keyIdx, status === 429 || status === 403 ? 60_000 : 15_000);
          continue;
        }
        // 4xx อื่น (เช่น 400) = provider นี้ปฏิเสธคำขอ
        // ยิง key อื่นของ provider เดิมก็ 400 ซ้ำ → ข้ามทั้ง provider
        // แล้วไป fallback provider ถัดไป (อย่า throw ทันที ไม่งั้น mistral ไม่ได้ทำงาน)
        if (status && status >= 400 && status < 500) {
          markCooldown(cfg.name, keyIdx, 30_000);
          break;
        }
        // timeout/network → ลอง key ถัดไป
        markCooldown(cfg.name, keyIdx, 15_000);
        continue;
      }
    }
  }

  throw new LLMError(
    `all providers exhausted. last error: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
    "all_providers_exhausted",
    lastErr,
  );
}

interface CallOnceResult {
  text: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

async function callOnce(
  cfg: ProviderConfig,
  keyIdx: number,
  messages: ChatTurn[],
  options: ChatOptions,
): Promise<CallOnceResult> {
  const client = getClient(cfg, cfg.keys[keyIdx]);
  const model = options.lite && cfg.liteModel ? cfg.liteModel : cfg.chatModel;
  const controller = new AbortController();
  // 30s default (not 60s) — the LINE webhook after() has a 60s hard budget
  // shared by classify + parse + chat-reply; no single LLM call should be
  // allowed to consume the whole budget. Callers needing more (none currently)
  // can pass an explicit timeoutMs.
  const timeoutMs = options.timeoutMs ?? 30_000;
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await client.chat.completions.create(
      {
        model,
        messages: messages.map((m) => {
          if (m.role === "system") return { role: "system" as const, content: m.content };
          if (m.role === "assistant") return { role: "assistant" as const, content: m.content };
          if (m.role === "tool") return { role: "tool" as const, content: m.content, tool_call_id: "" };
          return { role: "user" as const, content: m.content };
        }),
        temperature: options.temperature ?? 0.6,
        max_tokens: options.maxOutputTokens,
      },
      { signal: controller.signal },
    );
    const raw = res.choices?.[0]?.message?.content ?? "";
    const u = res.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
    return {
      text: stripReasoning(raw),
      usage: {
        promptTokens: u?.prompt_tokens ?? 0,
        completionTokens: u?.completion_tokens ?? 0,
        totalTokens: u?.total_tokens ?? 0,
      },
    };
  } finally {
    clearTimeout(t);
  }
}

export { splitReasoning };
