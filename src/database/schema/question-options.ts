import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { questions } from "@/database/schema/questions";

/**
 * Stores the correct-answer data for every question type, not just multiple choice —
 * `is_correct` rows are the accepted answer(s):
 *   multiple_choice / true_false   exactly one is_correct=true, one or more false (distractors)
 *   multiple_answer                two or more is_correct=true, one or more false
 *   short_answer / fill_in_blank   one or more is_correct=true, no false rows (accepted variants)
 * See backend/questions/question.schema.ts for the validation enforcing this per type.
 */
export const questionOptions = pgTable(
  "question_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    isCorrect: boolean("is_correct").notNull().default(false),
    // Display/definition order — also what randomization (Phase 7) shuffles from and can
    // fall back to.
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("question_options_question_id_idx").on(table.questionId)],
);

export type QuestionOption = typeof questionOptions.$inferSelect;
export type NewQuestionOption = typeof questionOptions.$inferInsert;
