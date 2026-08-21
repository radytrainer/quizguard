import {
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { questions } from "@/database/schema/questions";
import { quizzes } from "@/database/schema/quizzes";

/**
 * The quiz's question *pool* — not necessarily every question a student sees. When
 * `quizzes.randomize_questions` is true and the pool is larger than `questions_per_attempt`,
 * Phase 7 draws a random subset per attempt from this pool; otherwise every pooled question
 * is used, in `position` order. Composite PK (no surrogate id) for the same reason as
 * class_students: the row has no identity beyond "this question is in this quiz's pool."
 */
export const quizQuestions = pgTable(
  "quiz_questions",
  {
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.quizId, table.questionId] }),
    index("quiz_questions_question_id_idx").on(table.questionId),
  ],
);

export type QuizQuestion = typeof quizQuestions.$inferSelect;
export type NewQuizQuestion = typeof quizQuestions.$inferInsert;
