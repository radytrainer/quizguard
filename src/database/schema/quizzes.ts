import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "@/database/schema/users";

/**
 * draft -> published -> archived, plus draft <-> published via unpublish/publish. Distinct
 * from `deleted_at` (soft delete): an archived quiz is still visible/duplicable, a deleted
 * one is hidden everywhere — see Section 6 of the spec, which lists Delete and Archive as
 * separate actions.
 */
export const quizStatusEnum = pgEnum("quiz_status", [
  "draft",
  "published",
  "archived",
]);

export const quizzes = pgTable(
  "quizzes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    // Free text, matching questions.subject — the platform supports any subject.
    subject: text("subject").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    passingScore: integer("passing_score").notNull(),
    maxAttempts: integer("max_attempts").notNull().default(1),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    randomizeQuestions: boolean("randomize_questions").notNull().default(false),
    randomizeOptions: boolean("randomize_options").notNull().default(false),
    fullscreenRequired: boolean("fullscreen_required").notNull().default(false),
    monitorActivity: boolean("monitor_activity").notNull().default(false),
    autoSave: boolean("auto_save").notNull().default(true),
    autoSubmit: boolean("auto_submit").notNull().default(true),
    // Off by default: students see only their score/pass-fail (attempt.service.ts's getAttempt
    // always returns those) until the teacher explicitly releases the per-question answer
    // review, either here or via the one-click release-results/hide-results actions.
    showResults: boolean("show_results").notNull().default(false),
    // How many pooled questions each attempt draws (Phase 7 does the actual random sampling
    // at attempt-creation time; this phase only stores the configuration — see
    // docs/ARCHITECTURE.md — Section 7).
    questionsPerAttempt: integer("questions_per_attempt").notNull().default(1),
    status: quizStatusEnum("status").notNull().default("draft"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("quizzes_created_by_idx").on(table.createdBy),
    index("quizzes_status_idx").on(table.status),
    index("quizzes_subject_idx").on(table.subject),
  ],
);

export type Quiz = typeof quizzes.$inferSelect;
export type NewQuiz = typeof quizzes.$inferInsert;
export type QuizStatus = (typeof quizStatusEnum.enumValues)[number];
