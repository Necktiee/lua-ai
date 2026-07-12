/**
 * Centralized env access + validation.
 * ทุกไฟล์ควร import จากที่นี่ ไม่อ่าน process.env ตรงๆ
 */
import { z } from "zod";

const stringList = z
  .string()
  .transform((s) =>
    (s ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  )
  .default([] as string[]);

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.string().url().or(z.literal("")),

  LINE_CHANNEL_ACCESS_TOKEN: z.string(),
  LINE_CHANNEL_SECRET: z.string(),
  LINE_USER_WHITELIST: stringList,

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  SUPABASE_ANON_KEY: z.string(),

  QSTASH_TOKEN: z.string(),
  QSTASH_CURRENT_SIGNING_KEY: z.string(),
  QSTASH_NEXT_SIGNING_KEY: z.string(),

  // optional — ป้องกัน /api/cron/poll
  CRON_SECRET: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  GOOGLE_REDIRECT_URI: z.string().url(),

  GEMINI_API_KEYS: stringList,
  MISTRAL_API_KEYS: stringList,
  THAILLM_API_KEYS: stringList,
  OPENROUTER_API_KEYS: stringList,

  GEMINI_BASE_URL: z
    .string()
    .default("https://generativelanguage.googleapis.com/v1beta/openai"),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  GEMINI_MODEL_LITE: z.string().default("gemini-2.5-flash-lite"),

  MISTRAL_BASE_URL: z.string().default("https://api.mistral.ai/v1"),
  MISTRAL_MODEL: z.string().default("mistral-small-latest"),

  THAILLM_BASE_URL: z.string().default("https://api.openthaigpt.org/v1"),
  THAILLM_MODEL: z.string().default("openthaigpt-1.0.0-8b-chat"),

  OPENROUTER_BASE_URL: z.string().default("https://openrouter.ai/api/v1"),
  OPENROUTER_CHAT_MODEL: z.string().default("openai/gpt-4o-mini"),
  OPENROUTER_EMBEDDING_MODEL: z.string().default("baai/bge-m3"),

  LLM_PRIMARY_PROVIDER: z
    .enum(["gemini", "mistral", "thaillm", "openrouter"])
    .default("gemini"),
  LLM_FALLBACK_ORDER: stringList.default(["gemini", "mistral"]),
  LLM_EMBEDDING_PROVIDER: z
    .enum(["gemini", "mistral", "thaillm", "openrouter"])
    .default("openrouter"),
  LLM_EMBEDDING_MODEL: z.string().default("baai/bge-m3"),

  // Upstash Redis (optional — ใช้สำหรับ rate-limit counter ข้าม instance)
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // OpenWeatherMap (optional — for daily briefing weather)
  OPENWEATHER_API_KEY: z.string().optional(),
  WEATHER_LOCATION: z.string().default("Bangkok,TH"),

  // Tavily web search (optional — goal.search)
  TAVILY_API_KEY: z.string().optional(),

  // LIFF dashboard (LINE Login channel — แยกจาก Messaging API channel)
  LIFF_ID: z.string().optional(),
  LIFF_CHANNEL_ID: z.string().optional(),
  // secret เซ็น session cookie ของ dashboard (fallback ไปที่ LINE_CHANNEL_SECRET ถ้าไม่ตั้ง)
  SESSION_SECRET: z.string().optional(),

  // AES-256 key for Google tokens at rest (32-byte hex/base64, or any passphrase → SHA-256).
  // Outside the DB. If unset, tokens stored plaintext (dev only — warn in production).
  TOKEN_ENCRYPTION_KEY: z.string().optional(),

  // Single-owner mode: ถ้าตั้งค่าไว้ ทุก message/event/dashboard session จะถูก attribute
  // เข้า userId นี้หมด ไม่ว่าจะแชท/ล็อกอินด้วย LINE account ไหน (whitelist ยังเช็คก่อน)
  OWNER_LINE_USER_ID: z.string().optional(),
});

/**
 * Fail-closed invariant: single-owner mode (OWNER_LINE_USER_ID) remaps EVERY
 * incoming userId onto the owner's account. That remap is only safe if the
 * whitelist actually restricts who gets remapped — an empty whitelist means
 * "allow everyone," which combined with owner-mode would let any stranger who
 * messages the bot read/write the owner's private data. Refuse to boot in
 * production with this combination instead of silently exposing it.
 */
function assertOwnerModeInvariant(parsed: Env) {
  if (parsed.OWNER_LINE_USER_ID && parsed.LINE_USER_WHITELIST.length === 0) {
    const msg =
      "[env] OWNER_LINE_USER_ID is set but LINE_USER_WHITELIST is empty — " +
      "this would remap ANY LINE user's messages onto the owner's private data. " +
      "Set LINE_USER_WHITELIST (comma-separated userIds) before enabling single-owner mode.";
    if (parsed.NODE_ENV === "production") {
      console.error(msg);
      throw new Error(msg);
    }
    console.warn(msg);
  }
}

function load(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (parsed.success) {
    assertOwnerModeInvariant(parsed.data);
    return parsed.data;
  }

  const errors = parsed.error.flatten().fieldErrors;
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    console.error(
      "[env] missing/invalid vars (production):\n" + JSON.stringify(errors, null, 2),
    );
    throw new Error(`Invalid env in production: ${JSON.stringify(errors)}`);
  }

  // dev: warn but keep working — apply defaults so typed fields stay correct
  console.warn(
    "[env] missing/invalid vars (dev — using fallbacks):\n" +
      JSON.stringify(errors, null, 2),
  );
  const envWithDefaults = EnvSchema.safeParse({
    ...fallbackDefaults,
    ...Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ""),
    ),
  });
  const result = envWithDefaults.success ? envWithDefaults.data : (fallbackDefaults as Env);
  assertOwnerModeInvariant(result);
  return result;
}

/** typed fallback so dev mode never crashes on missing optional vars */
const fallbackDefaults: Env = {
  NODE_ENV: "development",
  APP_BASE_URL: "",
  LINE_CHANNEL_ACCESS_TOKEN: "",
  LINE_CHANNEL_SECRET: "",
  LINE_USER_WHITELIST: [],
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "",
  SUPABASE_ANON_KEY: "",
  QSTASH_TOKEN: "",
  QSTASH_CURRENT_SIGNING_KEY: "",
  QSTASH_NEXT_SIGNING_KEY: "",
  CRON_SECRET: undefined,
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  GOOGLE_REDIRECT_URI: "http://localhost:3000/api/cal/callback",
  GEMINI_API_KEYS: [],
  MISTRAL_API_KEYS: [],
  THAILLM_API_KEYS: [],
  OPENROUTER_API_KEYS: [],
  GEMINI_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/openai",
  GEMINI_MODEL: "gemini-2.5-flash",
  GEMINI_MODEL_LITE: "gemini-2.5-flash-lite",
  MISTRAL_BASE_URL: "https://api.mistral.ai/v1",
  MISTRAL_MODEL: "mistral-small-latest",
  THAILLM_BASE_URL: "https://api.openthaigpt.org/v1",
  THAILLM_MODEL: "openthaigpt-1.0.0-8b-chat",
  OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
  OPENROUTER_CHAT_MODEL: "openai/gpt-4o-mini",
  OPENROUTER_EMBEDDING_MODEL: "baai/bge-m3",
  LLM_PRIMARY_PROVIDER: "gemini",
  LLM_FALLBACK_ORDER: ["gemini", "mistral"],
  LLM_EMBEDDING_PROVIDER: "openrouter",
  LLM_EMBEDDING_MODEL: "baai/bge-m3",
  UPSTASH_REDIS_REST_URL: undefined,
  UPSTASH_REDIS_REST_TOKEN: undefined,
  OPENWEATHER_API_KEY: undefined,
  WEATHER_LOCATION: "Bangkok,TH",
  TAVILY_API_KEY: undefined,
  LIFF_ID: undefined,
  LIFF_CHANNEL_ID: undefined,
  TOKEN_ENCRYPTION_KEY: undefined,
  OWNER_LINE_USER_ID: undefined,
};

export const env = load();
export type Env = z.infer<typeof EnvSchema>;

/** ดูว่า env ครบสำหรับ feature นั้นไหม */
export function hasLine() {
  return Boolean(env.LINE_CHANNEL_ACCESS_TOKEN && env.LINE_CHANNEL_SECRET);
}
export function hasSupabase() {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}
export function hasQStash() {
  return Boolean(env.QSTASH_TOKEN);
}
export function hasGoogleCalendar() {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}
export function hasWebSearch() {
  return Boolean(env.TAVILY_API_KEY);
}
export function hasLiff() {
  return Boolean(env.LIFF_ID && env.LIFF_CHANNEL_ID);
}
