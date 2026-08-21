import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { quizAssignments } from "@/database/schema/quiz-assignments";
import { quizzes } from "@/database/schema/quizzes";
import { students } from "@/database/schema/students";

/**
 * `auto_submitted` (deadline passed, server graded it — either the client's own timer POSTed
 * `/submit` after the deadline, or a later request lazily discovered the expiry) is tracked
 * separately from `submitted` (the student submitted before the deadline) purely for reporting;
 * grading is identical either way. See backend/attempts/attempt.service.ts.
 */
export const attemptStatusEnum = pgEnum("attempt_status", [
  "in_progress",
  "submitted",
  "auto_submitted",
]);

export const examAttempts = pgTable(
  "exam_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Restrict, not cascade: a quiz with attempt history shouldn't be hard-deletable — see
    // quiz_questions.question_id for the same reasoning. Quiz deletion is soft (deletedAt).
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "restrict" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.userId, { onDelete: "cascade" }),
    // Which assignment granted access, for audit purposes only — nullable because the
    // assignment can be removed later without invalidating the historical attempt record.
    assignmentId: uuid("assignment_id").references(() => quizAssignments.id, {
      onDelete: "set null",
    }),
    attemptNumber: integer("attempt_number").notNull(),
    status: attemptStatusEnum("status").notNull().default("in_progress"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Computed once at creation (startedAt + quiz.durationMinutes) — the sole source of truth
    // for when this attempt ends. The client only ever renders a countdown to this fixed
    // instant; it never reports elapsed time, and every mutating request re-checks against this
    // column using the server's clock (Rule: never trust client-side score or timer).
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    score: integer("score"),
    maxScore: integer("max_score"),
    passed: boolean("passed"),
    // Set when the student exits fullscreen mid-exam on a quiz that requires it (Section 10) —
    // while locked, every mutating endpoint (answers, submit, further violation reports) rejects
    // with a 409 until a teacher explicitly unlocks it (monitoring.service.ts's
    // `unlockAttempt`). The deadline keeps ticking underneath; locking never pauses the clock.
    locked: boolean("locked").notNull().default(false),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
  },
  (table) => [
    index("exam_attempts_quiz_id_idx").on(table.quizId),
    index("exam_attempts_student_id_idx").on(table.studentId),
    // A student can only have one attempt in flight per quiz at a time — reopening the quiz
    // resumes it rather than starting a second one. Enforced here, not just in application
    // code, for the same reason as quiz_assignments' target-XOR constraint (Section 9).
    uniqueIndex("exam_attempts_one_in_progress_unique")
      .on(table.quizId, table.studentId)
      .where(sql`${table.status} = 'in_progress'`),
  ],
);

export type ExamAttempt = typeof examAttempts.$inferSelect;
export type NewExamAttempt = typeof examAttempts.$inferInsert;
export type AttemptStatus = (typeof attemptStatusEnum.enumValues)[number];
