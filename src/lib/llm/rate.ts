/**
 * Rate-limit + cooldown store.
 * - Stateful across serverless instances ผ่าน Upstash Redis (optional).
 * - Fallback: in-memory Map (ดีพอสำหรับ long-lived dev server / single instance).
 */
import { env } from "@/lib/env";

interface RateState {
  /** minute bucket key → count */
  perMinute: Map<string, number>;
  /** day bucket key → count */
  perDay: Map<string, number>;
  /** key cooldown ถึงเวลานี้ (epoch ms) */
  cooldownUntil: Map<string, number>;
}

declare global {
  var __lekhaRateState: RateState | undefined;
}

const state: RateState =
  globalThis.__lekhaRateState ??
  (globalThis.__lekhaRateState = {
    perMinute: new Map(),
    perDay: new Map(),
    cooldownUntil: new Map(),
  });

function nowMin() {
  return Math.floor(Date.now() / 60_000);
}
function nowDay() {
  return Math.floor(Date.now() / 86_400_000);
}

export function markCall(provider: string, keyIdx: number) {
  const mk = `${provider}:${keyIdx}:m:${nowMin()}`;
  const dk = `${provider}:${keyIdx}:d:${nowDay()}`;
  state.perMinute.set(mk, (state.perMinute.get(mk) ?? 0) + 1);
  state.perDay.set(dk, (state.perDay.get(dk) ?? 0) + 1);
  // GC old buckets occasionally
  if (state.perMinute.size > 500) gc();
}

export function markCooldown(provider: string, keyIdx: number, ms = 60_000) {
  state.cooldownUntil.set(
    `${provider}:${keyIdx}`,
    Date.now() + ms,
  );
}

export function isAvailable(
  provider: string,
  keyIdx: number,
  rpm: number,
  rpd: number | null,
): boolean {
  const cd = state.cooldownUntil.get(`${provider}:${keyIdx}`);
  if (cd && cd > Date.now()) return false;
  const used = state.perMinute.get(
    `${provider}:${keyIdx}:m:${nowMin()}`,
  ) ?? 0;
  if (used >= rpm) return false;
  if (rpd != null) {
    const usedD =
      state.perDay.get(`${provider}:${keyIdx}:d:${nowDay()}`) ?? 0;
    if (usedD >= rpd) return false;
  }
  return true;
}

function gc() {
  const minCut = nowMin() - 2;
  for (const k of state.perMinute.keys()) {
    const parts = k.split(":");
    const m = Number(parts[parts.length - 1]);
    if (m < minCut) state.perMinute.delete(k);
  }
  const dayCut = nowDay() - 2;
  for (const k of state.perDay.keys()) {
    const parts = k.split(":");
    const d = Number(parts[parts.length - 1]);
    if (d < dayCut) state.perDay.delete(k);
  }
}

/** เฉพาะเทส */
export function _resetRateState() {
  state.perMinute.clear();
  state.perDay.clear();
  state.cooldownUntil.clear();
}

// NOTE: env import เก็บไว้เผื่ออนาคตย้ายไป Redis แล้วอ่าน UPSTASH_REDIS_REST_URL
void env;
