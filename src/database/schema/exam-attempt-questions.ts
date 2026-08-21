import { index, integer, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";

import { examAttempts } from "@/database/schema/exam-attempts";
import { questions } from "@/database/schema/questions";

/**
 * The frozen per-attempt question snapshot — which questions this specific attempt drew from
 * the quiz's pool (Section 7), and in what order, decided once at `startAttempt` and never
 * recomputed. `option_order` is the presented option order (shuffled per attempt when
 * `quizzes.randomize_options` is on, natural `question_options.position` order otherwise) —
 * storing it here, not deriving it at render time, is what makes the same attempt show the same
 * option order on every reload and keeps grading unambiguous about what the student actually saw.
 */
export const examAttemptQuestions = pgTable(
  "exam_attempt_questions",
  {
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => examAttempts.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    optionOrder: uuid("option_order").array().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.attemptId, table.questionId] }),
    index("exam_attempt_questions_attempt_id_idx").on(table.attemptId),
  ],
);

export type ExamAttemptQuestion = typeof examAttemptQuestions.$inferSelect;
export type NewExamAttemptQuestion = typeof examAttemptQuestions.$inferInsert;
