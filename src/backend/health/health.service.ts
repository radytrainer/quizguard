import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { redis } from "@/lib/redis";

export type ServiceStatus = "connected" | "error";

export interface HealthReport {
  status: "healthy" | "degraded";
  database: ServiceStatus;
  redis: ServiceStatus;
  timestamp: string;
}

async function checkDatabase(): Promise<ServiceStatus> {
  try {
    await db.execute(sql`select 1`);
    return "connected";
  } catch {
    return "error";
  }
}

async function checkRedis(): Promise<ServiceStatus> {
  try {
    const pong = await redis.ping();
    return pong === "PONG" ? "connected" : "error";
  } catch {
    return "error";
  }
}

export async function getHealthReport(): Promise<HealthReport> {
  const [database, redisStatus] = await Promise.all([
    checkDatabase(),
    checkRedis(),
  ]);

  return {
    status:
      database === "connected" && redisStatus === "connected"
        ? "healthy"
        : "degraded",
    database,
    redis: redisStatus,
    timestamp: new Date().toISOString(),
  };
}
