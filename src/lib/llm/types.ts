/** LLM-side types (แยกจาก domain types) */
export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatTurn {
  role: ChatRole;
  content: string;
}

export interface ChatOptions {
  /** provider override; default = LLM_PRIMARY_PROVIDER */
  provider?: ProviderName;
  /** ใช้ lite model (gemini-flash-lite) สำหรับงานเบา เช่น intent classification */
  lite?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  /** timeout per attempt (ms) */
  timeoutMs?: number;
}

export interface EmbedOptions {
  provider?: ProviderName;
}

export type ProviderName = "gemini" | "mistral" | "thaillm" | "openrouter";

export interface ProviderConfig {
  name: ProviderName;
  baseURL: string;
  chatModel: string;
  liteModel?: string;
  embedModel: string;
  keys: string[];
  rpmPerKey: number;
  rpdPerKey: number | null;
}

export interface ChatResult {
  text: string;
  provider: ProviderName;
  model: string;
  keyIndex: number;
  attempts: number;
  elapsedMs: number;
}

export class LLMError extends Error {
  constructor(
    message: string,
    public code:
      | "all_keys_exhausted"
      | "all_providers_exhausted"
      | "timeout"
      | "network"
      | "bad_response"
      | "no_keys",
    public cause?: unknown,
  ) {
    super(message);
    this.name = "LLMError";
  }
}
