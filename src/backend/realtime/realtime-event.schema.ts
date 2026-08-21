import { z } from "zod";

/**
 * Pure Zod, no `"server-only"` and no other backend imports — this is the contract shared
 * across a process boundary: the Next app publishes these to Redis (realtime.service.ts),
 * src/realtime/server.ts (a separate Node process, see Section 12) subscribes and re-validates
 * before forwarding to any browser, and the browser's socket client (features/realtime) expects
 * this same shape. Re-validating on the subscribing side matters because Redis Pub/Sub carries
 * whatever bytes were published — the schema is the only thing guaranteeing a malformed message
 * (a bug in some future publisher) doesn't reach a teacher's browser as-is.
 */
export const REALTIME_CHANNEL = "realtime:events";

const base = {
  quizId: z.string().uuid(),
  attemptId: z.string().uuid(),
  studentId: z.string().uuid(),
  studentName: z.string().max(200),
  // ISO 8601 (`toISOString()`), not a Date — this schema crosses a process boundary (JSON
  // over Redis Pub/Sub), where a real Date object doesn't survive serialization anyway.
  occurredAt: z.string().max(64),
};

export const realtimeEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("attempt_started"), ...base }),
  z.object({
    type: z.literal("attempt_submitted"),
    ...base,
    status: z.enum(["submitted", "auto_submitted"]),
    score: z.number().nullable(),
    maxScore: z.number().nullable(),
    passed: z.boolean().nullable(),
  }),
  z.object({
    type: z.literal("violation"),
    ...base,
    violationType: z.enum(["fullscreen_exit", "tab_switch", "copy_paste"]),
    // True when this specific violation just locked the attempt (a fullscreen exit on a quiz
    // that requires it) — carried on the event itself so both the student's own tab and any
    // teacher watching update immediately, without a second round trip.
    locked: z.boolean(),
  }),
  z.object({ type: z.literal("attempt_unlocked"), ...base }),
]);

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
