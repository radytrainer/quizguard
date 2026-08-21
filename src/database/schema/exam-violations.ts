import { index, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import { examAttempts } from "@/database/schema/exam-attempts";

/**
 * Every type here is something a browser can honestly observe about its own page — never a
 * claim about what's happening outside it (Rule: never claim to see other applications).
 * `fullscreen_exit` only fires when `quizzes.fullscreen_required` is on; `tab_switch`
 * (the page's own `visibilitychange` event — covers alt-tab, switching tabs, and minimizing,
 * which the browser reports identically) and `copy_paste` only fire when
 * `quizzes.monitor_activity` is on. See features/attempts/exam-attempt.tsx for the detection
 * code and the on-screen disclosure shown to the student before it starts watching.
 */
export const violationTypeEnum = pgEnum("violation_type", [
  "fullscreen_exit",
  "tab_switch",
  "copy_paste",
]);

export const examViolations = pgTable(
  "exam_violations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => examAttempts.id, { onDelete: "cascade" }),
    type: violationTypeEnum("type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("exam_violations_attempt_id_idx").on(table.attemptId)],
);

export type ExamViolation = typeof examViolations.$inferSelect;
export type NewExamViolation = typeof examViolations.$inferInsert;
export type ViolationType = (typeof violationTypeEnum.enumValues)[number];
