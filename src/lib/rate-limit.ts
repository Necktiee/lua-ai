import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

const inMemoryStore = new Map<string, { count: number; resetAt: number }>();

function getRedis(): Redis | null {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
  return new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Fixed-window rate limiter.
 * Uses Upstash Redis when configured (works across serverless instances).
 * Falls back to in-memory Map in dev.
 */
export async function rateLimit(
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const redis = getRedis();
  const now = Math.floor(Date.now() / 1000);
  const windowKey = Math.floor(now / windowSeconds);
  const key = `rl:${identifier}:${windowKey}`;
  const resetAt = (windowKey + 1) * windowSeconds * 1000;

  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }
      return {
        success: count <= limit,
        limit,
        remaining: Math.max(0, limit - count),
        resetAt,
      };
    } catch (e) {
      console.warn("[rate-limit] redis error, falling back to memory", (e as Error).message);
    }
  }

  const entry = inMemoryStore.get(key);
  const count = entry ? entry.count + 1 : 1;
  inMemoryStore.set(key, { count, resetAt });
  if (inMemoryStore.size > 10000) {
    const cutoff = Date.now();
    for (const [k, v] of inMemoryStore) {
      if (v.resetAt < cutoff) inMemoryStore.delete(k);
    }
  }
  return {
    success: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt,
  };
}

export function rateLimitResponse(result: RateLimitResult): Response {
  return Response.json(
    { error: "rate_limit_exceeded", retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000) },
    {
      status: 429,
      headers: {
        "x-ratelimit-limit": String(result.limit),
        "x-ratelimit-remaining": String(result.remaining),
        "x-ratelimit-reset": String(Math.floor(result.resetAt / 1000)),
      },
    },
  );
}
