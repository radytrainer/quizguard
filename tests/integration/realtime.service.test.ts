import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashPassword } from "@/backend/auth/password";
import {
  REALTIME_CHANNEL,
  type RealtimeEvent,
} from "@/backend/realtime/realtime-event.schema";
import {
  getStudentName,
  publishRealtimeEvent,
} from "@/backend/realtime/realtime.service";
import { db, pool } from "@/lib/db";
import { env } from "@/lib/env";
import { users } from "@/database/schema";

// Requires `docker compose up -d` (PostgreSQL + Redis).
describe("realtime.service (integration)", () => {
  const suffix = randomUUID().slice(0, 8);
  let studentId: string;
  let subscriber: Redis;

  beforeAll(async () => {
    const passwordHash = await hashPassword("irrelevant");
    const [student] = await db
      .insert(users)
      .values({
        email: `realtime-service-student-${suffix}@quizguard.test`,
        name: "Realtime Service Student",
        role: "student",
        passwordHash,
      })
      .returning();
    studentId = student.id;

    subscriber = new Redis(env.REDIS_URL);
    await subscriber.subscribe(REALTIME_CHANNEL);
  });

  afterAll(async () => {
    subscriber.disconnect();
    await db.delete(users).where(eq(users.id, studentId));
    await pool.end();
  });

  it("looks up a student's name, falling back for an unknown id", async () => {
    expect(await getStudentName(studentId)).toBe("Realtime Service Student");
    expect(await getStudentName(randomUUID())).toBe("Unknown student");
  });

  it("publishes a valid event that a subscriber receives verbatim", async () => {
    const event: RealtimeEvent = {
      type: "violation",
      quizId: randomUUID(),
      attemptId: randomUUID(),
      studentId,
      studentName: "Realtime Service Student",
      violationType: "copy_paste",
      locked: false,
      occurredAt: new Date().toISOString(),
    };

    const received = new Promise<RealtimeEvent>((resolve) => {
      subscriber.once("message", (_channel, message) => {
        resolve(JSON.parse(message) as RealtimeEvent);
      });
    });

    await publishRealtimeEvent(event);

    await expect(received).resolves.toEqual(event);
  });
});
