import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { classes } from "@/database/schema/classes";
import { quizzes } from "@/database/schema/quizzes";
import { users } from "@/database/schema/users";

/**
 * A synchronous, host-paced multiplayer round — distinct from exam_attempts' asynchronous,
 * individually-timed model. One row per hosted game; question-by-question state lives on this
 * row so the realtime server (src/realtime/server.ts) can read/advance it directly.
 */
export const liveSessionStatusEnum = pgEnum("live_session_status", [
  "lobby",
  "question",
  "reveal",
  "leaderboard",
  "finished",
  "cancelled",
]);

export const liveSessions = pgTable(
  "live_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // restrict: a quiz with live-session history shouldn't be hard-deletable — same reasoning
    // as exam_attempts.quiz_id.
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "restrict" }),
    hostId: uuid("host_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // Null = open to any authenticated student with the join code. Set = only that class's
    // roster may join. restrict, not cascade: preserves session history/scores even if the
    // class is later deleted.
    classId: uuid("class_id").references(() => classes.id, {
      onDelete: "restrict",
    }),
    // 6-digit numeric, human-typeable like a Kahoot game PIN.
    joinCode: text("join_code").notNull(),
    status: liveSessionStatusEnum("status").notNull().default("lobby"),
    // Question IDs, snapshotted once at creation — fixed for the whole room, not resampled per
    // student (everyone must see the same question at the same time).
    questionOrder: uuid("question_order").array().notNull(),
    currentQuestionIndex: integer("current_question_index"),
    // Server-authoritative clock for the countdown and speed scoring — never trust a
    // client-reported elapsed time, same principle as exam_attempts.deadline_at.
    currentQuestionStartedAt: timestamp("current_question_started_at", {
      withTimezone: true,
    }),
    timeLimitSeconds: integer("time_limit_seconds").notNull().default(20),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    index("live_sessions_quiz_id_idx").on(table.quizId),
    index("live_sessions_host_id_idx").on(table.hostId),
    // Partial, not plain: a finished/cancelled code can be reused by a later session — only
    // codes still in play need to be unique.
    uniqueIndex("live_sessions_join_code_active_unique")
      .on(table.joinCode)
      .where(sql`${table.status} not in ('finished', 'cancelled')`),
  ],
);

export type LiveSession = typeof liveSessions.$inferSelect;
export type NewLiveSession = typeof liveSessions.$inferInsert;
export type LiveSessionStatus =
  (typeof liveSessionStatusEnum.enumValues)[number];
