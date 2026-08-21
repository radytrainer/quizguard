import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { users } from "@/database/schema";
import {
  REALTIME_CHANNEL,
  type RealtimeEvent,
} from "@/backend/realtime/realtime-event.schema";

export async function getStudentName(studentId: string): Promise<string> {
  const [row] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, studentId))
    .limit(1);
  return row?.name ?? "Unknown student";
}

/**
 * Fire-and-forget by design, same as the client's own violation reporting
 * (features/attempts/exam-attempt.tsx) — a dropped realtime notification is a monitoring gap,
 * never a reason to fail the state-changing operation (starting an attempt, grading it,
 * recording a violation) that triggered it. Redis is temporary/best-effort state (Section 3);
 * this is exactly that.
 */
export async function publishRealtimeEvent(
  event: RealtimeEvent,
): Promise<void> {
  try {
    await redis.publish(REALTIME_CHANNEL, JSON.stringify(event));
  } catch {
    // Best-effort — see above.
  }
}
