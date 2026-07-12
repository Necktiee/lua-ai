/**
 * Circuit breaker — protects against retry storms during provider outages.
 *
 * Tracks consecutive failures per provider. After a threshold, the circuit
 * "opens" and short-circuits all calls to that provider for a cooldown
 * period. After cooldown, the circuit enters "half-open" — one trial call
 * is allowed. On success, the circuit closes. On failure, it re-opens.
 *
 * State is in-memory (same as rate limiter). On serverless cold start,
 * all circuits reset to closed, which is safe — the first calls will
 * probe the provider naturally.
 */

import type { ProviderName } from "./types";

type CircuitState = "closed" | "open" | "half_open";

interface BreakerEntry {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number;
  lastError: string | null;
}

const THRESHOLD = 5;
const COOLDOWN_MS = 60_000;

const breakers = new Map<ProviderName, BreakerEntry>();

function getEntry(provider: ProviderName): BreakerEntry {
  let e = breakers.get(provider);
  if (!e) {
    e = { state: "closed", consecutiveFailures: 0, openedAt: 0, lastError: null };
    breakers.set(provider, e);
  }
  return e;
}

export function isProviderAvailable(provider: ProviderName): boolean {
  const e = getEntry(provider);
  if (e.state === "open") {
    if (Date.now() - e.openedAt >= COOLDOWN_MS) {
      e.state = "half_open";
      return true;
    }
    return false;
  }
  return true;
}

export function recordSuccess(provider: ProviderName): void {
  const e = getEntry(provider);
  e.state = "closed";
  e.consecutiveFailures = 0;
  e.lastError = null;
}

export function recordFailure(provider: ProviderName, errorMsg?: string): void {
  const e = getEntry(provider);
  e.consecutiveFailures++;
  e.lastError = errorMsg?.slice(0, 200) ?? null;
  if (e.consecutiveFailures >= THRESHOLD) {
    e.state = "open";
    e.openedAt = Date.now();
  }
}

export function getBreakerStatus(): Record<string, { state: CircuitState; failures: number; lastError: string | null }> {
  const out: Record<string, { state: CircuitState; failures: number; lastError: string | null }> = {};
  for (const [name, e] of breakers) {
    out[name] = { state: e.state, failures: e.consecutiveFailures, lastError: e.lastError };
  }
  return out;
}

export function resetBreaker(provider: ProviderName): void {
  breakers.delete(provider);
}
