import { Redis } from "ioredis";

import { env } from "@/lib/env";

/**
 * Cached on `globalThis` for the same reason as `pool` in `db.ts` — survive Next.js dev-mode
 * hot reload without opening a new connection every save. This client is for temporary/
 * high-frequency state (exam sessions, rate limiting, active-exam status); PostgreSQL remains
 * the source of truth (see docs/ARCHITECTURE.md — Redis Usage Boundaries).
 */
const globalForRedis = globalThis as unknown as {
  redis?: Redis;
};

export const redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
  });

if (env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
