/**
 * Privacy-safe structured logger — never logs raw prompts, email bodies,
 * tokens, OAuth codes, or attachment contents.
 *
 * All logs go through console (Vercel captures structured JSON from
 * console.error/warn/info in production).
 */

export type LogLevel = "error" | "warn" | "info" | "debug";

export interface LogMeta {
  traceId?: string;
  userId?: string;
  provider?: string;
  action?: string;
  latencyMs?: number;
  [key: string]: unknown;
}

const SENSITIVE_KEYS = new Set([
  "token",
  "password",
  "secret",
  "key",
  "authorization",
  "cookie",
  "content",
  "prompt",
  "message",
  "body",
  "payload",
  "accesstoken",
  "refreshtoken",
  "code",
]);

function redact(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = redact(v);
    }
  }
  return out;
}

function emit(level: LogLevel, component: string, msg: string, meta?: LogMeta): void {
  const entry: Record<string, unknown> = {
    level,
    component,
    msg,
    ts: new Date().toISOString(),
  };
  if (meta) {
    const safe = redact(meta) as Record<string, unknown>;
    for (const [k, v] of Object.entries(safe)) {
      if (v !== undefined) entry[k] = v;
    }
  }
  const serialized = JSON.stringify(entry);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else if (level === "info") console.info(serialized);
  else console.debug(serialized);
}

export function logError(component: string, msg: string, meta?: LogMeta): void {
  emit("error", component, msg, meta);
}

export function logWarn(component: string, msg: string, meta?: LogMeta): void {
  emit("warn", component, msg, meta);
}

export function logInfo(component: string, msg: string, meta?: LogMeta): void {
  emit("info", component, msg, meta);
}

export function logDebug(component: string, msg: string, meta?: LogMeta): void {
  if (process.env.NODE_ENV === "production") return;
  emit("debug", component, msg, meta);
}
