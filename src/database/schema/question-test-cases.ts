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
 * code_answer (Phase 16 — not consumed by any application code yet, see questions.ts's own
 * code_answer columns) input -> expected-stdout pairs, python/javascript only: html/css
 * questions are graded by a live sandboxed preview + manual review instead (no execution), so
 * they never have rows here. `is_sample` rows are the ones a student's own "Run" can see —
 * hidden rows only ever get executed server-side, at submit, and are never returned to the
 * client (the whole point of having both kinds).
 */
export const questionTestCases = pgTable(
  "question_test_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    input: text("input").notNull().default(""),
    expectedOutput: text("expected_output").notNull(),
    isSample: boolean("is_sample").notNull().default(false),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("question_test_cases_question_id_idx").on(table.questionId),
  ],
);

export type QuestionTestCase = typeof questionTestCases.$inferSelect;
export type NewQuestionTestCase = typeof questionTestCases.$inferInsert;
