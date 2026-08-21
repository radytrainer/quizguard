import { afterAll, describe, expect, it } from "vitest";

import { pool } from "@/lib/db";
import { redis } from "@/lib/redis";
import { getHealthReport } from "@/backend/health/health.service";

// Requires `docker compose up -d` (PostgreSQL + Redis) and a valid .env.local.
describe("getHealthReport (integration)", () => {
  afterAll(async () => {
    await pool.end();
    redis.disconnect();
  });

  it("reports PostgreSQL and Redis as connected", async () => {
    const report = await getHealthReport();

    expect(report.database).toBe("connected");
    expect(report.redis).toBe("connected");
    expect(report.status).toBe("healthy");
  });
});
