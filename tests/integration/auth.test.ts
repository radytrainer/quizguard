import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, pool } from "@/lib/db";
import { redis } from "@/lib/redis";
import { users } from "@/database/schema";
import { hashPassword } from "@/backend/auth/password";
import { login, logout } from "@/backend/auth/auth.service";
import { ApiError } from "@/lib/api-response";

// Requires `docker compose up -d` (PostgreSQL + Redis) and a valid .env.test.
describe("auth service (integration)", () => {
  const activeEmail = "integration-active@quizguard.test";
  const disabledEmail = "integration-disabled@quizguard.test";
  const password = "correct horse battery staple";

  beforeAll(async () => {
    const passwordHash = await hashPassword(password);
    await db.insert(users).values([
      {
        email: activeEmail,
        name: "Active Test User",
        role: "teacher",
        status: "active",
        passwordHash,
      },
      {
        email: disabledEmail,
        name: "Disabled Test User",
        role: "teacher",
        status: "disabled",
        passwordHash,
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.email, activeEmail));
    await db.delete(users).where(eq(users.email, disabledEmail));
    await pool.end();
    redis.disconnect();
  });

  it("logs in with correct credentials and creates a Redis session", async () => {
    const { user, sessionToken } = await login({
      email: activeEmail,
      password,
    });

    expect(user.email).toBe(activeEmail);
    expect(user.role).toBe("teacher");

    const stored = await redis.get(`session:${sessionToken}`);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toMatchObject({ email: activeEmail });
  });

  it("rejects an incorrect password", async () => {
    await expect(
      login({ email: activeEmail, password: "wrong password" }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("rejects a disabled account even with the correct password", async () => {
    await expect(
      login({ email: disabledEmail, password }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("rejects an email that doesn't exist", async () => {
    await expect(
      login({ email: "nobody@quizguard.test", password }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("removes the session from Redis on logout", async () => {
    const { sessionToken } = await login({ email: activeEmail, password });
    expect(await redis.get(`session:${sessionToken}`)).not.toBeNull();

    await logout(sessionToken);

    expect(await redis.get(`session:${sessionToken}`)).toBeNull();
  });
});
