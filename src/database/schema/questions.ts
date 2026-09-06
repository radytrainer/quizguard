import {
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "@/database/schema/users";

export const questionTypeEnum = pgEnum("question_type", [
  "multiple_choice",
  "true_false",
  "multiple_answer",
  "short_answer",
  "fill_in_blank",
  "essay",
  "numeric_answer",
  "code_answer",
]);

export const questionDifficultyEnum = pgEnum("question_difficulty", [
  "easy",
  "medium",
  "hard",
]);

// code_answer only — which language the student's editor/execution targets. Values kept in
// sync with backend/questions/question-types.ts's own CODE_LANGUAGES list (that one isn't a DB
// enum, so it can't just re-export this one; see that file for why).
export const codeLanguageEnum = pgEnum("code_language", [
  "html",
  "css",
  "python",
  "javascript",
]);

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: questionTypeEnum("type").notNull(),
    // Free text, not an enum: the platform supports any subject (DBA, MySQL, PHP, English,
    // Mathematics, ...), so a fixed list would contradict that.
    subject: text("subject").notNull(),
    category: text("category"),
    difficulty: questionDifficultyEnum("difficulty")
      .notNull()
      .default("medium"),
    points: integer("points").notNull().default(1),
    text: text("text").notNull(),
    explanation: text("explanation"),
    tags: text("tags").array().notNull().default([]),
    // numeric_answer only — the accepted value itself still lives in question_options (same
    // "one accepted value per row" convention as short_answer/fill_in_blank), this is just the
    // ± tolerance around it.
    numericTolerance: doublePrecision("numeric_tolerance"),
    // code_answer only (Phase 15 schema, Phase 16 application code — see
    // docs/ARCHITECTURE.md's phase list) — added now so the later phase needs no migration of
    // its own. All nullable; every other question type leaves them null.
    codeLanguage: codeLanguageEnum("code_language"),
    starterCode: text("starter_code"),
    // Fixed HTML shell a `codeLanguage: "css"` question's student-written CSS previews
    // against — CSS alone has nothing to render into.
    previewHtml: text("preview_html"),
    // Teacher-only model answer — never selected into any student-facing query.
    referenceSolution: text("reference_solution"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Soft delete: quiz_questions (Phase 4) will reference questions, and a quiz already
    // published/taken shouldn't lose the question it was built from.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("questions_subject_idx").on(table.subject),
    index("questions_category_idx").on(table.category),
    index("questions_difficulty_idx").on(table.difficulty),
    index("questions_type_idx").on(table.type),
    index("questions_created_by_idx").on(table.createdBy),
    index("questions_tags_idx").using("gin", table.tags),
  ],
);

export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;
export type QuestionType = (typeof questionTypeEnum.enumValues)[number];
export type QuestionDifficulty =
  (typeof questionDifficultyEnum.enumValues)[number];
