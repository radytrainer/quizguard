import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { examAttempts } from "@/database/schema/exam-attempts";
import { questions } from "@/database/schema/questions";
import { users } from "@/database/schema/users";

/**
 * One row per (attempt, question) — saving an answer again replaces the row rather than
 * appending, matching the autosave UX (the student can change their mind before submitting).
 * Exactly one of `selected_option_ids` (multiple_choice/true_false/multiple_answer) or
 * `text_answer` (short_answer/fill_in_blank) is populated, matching the question's type —
 * enforced in backend/answers/answer.schema.ts against the question being answered, not by a
 * DB constraint, since it requires knowing the referenced question's type. `is_correct` /
 * `points_awarded` are null until `submitAttempt` grades the whole attempt at once — grading
 * happens exactly once, server-side, never incrementally as answers are saved.
 *
 * `needs_review` marks a question that gradeAttempt() couldn't auto-score (essay always;
 * code_answer only for html/css, which has no pass/fail exit code to run — see
 * backend/questions/question-types.ts#needsManualGrading) — `points_awarded` sits at 0
 * provisionally until a teacher calls answer.service.ts#gradeAnswer, which is also how an
 * auto-graded answer can be manually overridden (not gated on needs_review), hence
 * `graded_by`/`graded_at` being meaningful for either path.
 */
export const examAnswers = pgTable(
  "exam_answers",
  {
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => examAttempts.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    selectedOptionIds: uuid("selected_option_ids").array(),
    textAnswer: text("text_answer"),
    isCorrect: boolean("is_correct"),
    pointsAwarded: integer("points_awarded"),
    needsReview: boolean("needs_review").notNull().default(false),
    gradedBy: uuid("graded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    gradedAt: timestamp("graded_at", { withTimezone: true }),
    teacherFeedback: text("teacher_feedback"),
    // code_answer (Phase 16) only — a snapshot of each test case's pass/fail + actual output at
    // grading time, deliberately never recomputed later (a teacher editing test cases
    // afterward must not silently change a historical grade).
    testResults: jsonb("test_results"),
    answeredAt: timestamp("answered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.attemptId, table.questionId] })],
);

export type ExamAnswer = typeof examAnswers.$inferSelect;
export type NewExamAnswer = typeof examAnswers.$inferInsert;
