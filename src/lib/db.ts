import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "@/database/schema";
import { env } from "@/lib/env";

/**
 * Cached on `globalThis` so Next.js dev-mode hot reload (which re-evaluates modules on every
 * change) reuses one pool instead of leaking a new one per reload. In production each app
 * instance still gets exactly one pool, sized so a handful of instances can share Postgres's
 * default `max_connections` (100) without exhausting it — see docs/ARCHITECTURE.md —
 * Section 22. `max: 10` was the original placeholder; Phase 12 load testing a burst of 150
 * concurrent students hitting the exam-start path found requests queuing past
 * `connectionTimeoutMillis` and failing outright. Raised to 20 (5 instances' worth of headroom
 * within `max_connections`) based on that evidence, not guessed in advance.
 */
const globalForDb = globalThis as unknown as {
  pgPool?: Pool;
};

export const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

if (env.NODE_ENV !== "production") {
  globalForDb.pgPool = pool;
}

export const db = drizzle(pool, { schema });
