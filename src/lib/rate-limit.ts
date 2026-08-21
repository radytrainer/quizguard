import type { Redis } from "ioredis";

import { redis } from "@/lib/redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Fixed-window counter in Redis. Simple and good enough for abuse protection (login, exam
 * start, event sync, imports — section 31): a client can burst up to `limit` right at a window
 * boundary, which a sliding-window log would prevent, but that precision isn't worth the extra
 * Redis round trips here.
 */
export async function checkRateLimit(
  key: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
  client: Redis = redis,
): Promise<RateLimitResult> {
  const redisKey = `ratelimit:${key}`;
  const count = await client.incr(redisKey);

  if (count === 1) {
    await client.expire(redisKey, windowSeconds);
  }

  const ttl = await client.ttl(redisKey);
  const resetAt = Date.now() + Math.max(ttl, 0) * 1000;

  return {
    allowed: count <= limit,
    remaining: Math.max(limit - count, 0),
    resetAt,
  };
}
