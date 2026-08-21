import { index, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import { examAttempts } from "@/database/schema/exam-attempts";

/**
 * A durable audit trail of every lock/unlock transition (Section 10) — `exam_attempts.locked`
 * and `.locked_at` only track the *current* state, overwritten on every change, so on their own
 * they can't answer "was this attempt ever locked, and when was it unlocked" once a teacher has
 * cleared it. This table exists purely so `getActivityHistory` (monitoring.service.ts) can
 * reconstruct that history for the "Live activity" panel even after a page refresh or long
 * after the exam period has ended.
 */
export const lockEventActionEnum = pgEnum("lock_event_action", [
  "locked",
  "unlocked",
]);

export const attemptLockEvents = pgTable(
  "attempt_lock_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => examAttempts.id, { onDelete: "cascade" }),
    action: lockEventActionEnum("action").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("attempt_lock_events_attempt_id_idx").on(table.attemptId)],
);

export type AttemptLockEvent = typeof attemptLockEvents.$inferSelect;
export type NewAttemptLockEvent = typeof attemptLockEvents.$inferInsert;
export type LockEventAction = (typeof lockEventActionEnum.enumValues)[number];
