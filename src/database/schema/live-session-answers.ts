import {
  boolean,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { liveSessionParticipants } from "@/database/schema/live-session-participants";
import { liveSessions } from "@/database/schema/live-sessions";
import { questions } from "@/database/schema/questions";

export const liveSessionAnswers = pgTable(
  "live_session_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => liveSessions.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => liveSessionParticipants.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    // Denormalized position within live_sessions.question_order, for cheap per-question queries
    // (reveal distribution, answer counts) without joining back to the session row.
    questionIndex: integer("question_index").notNull(),
    selectedOptionIds: uuid("selected_option_ids").array().notNull(),
    isCorrect: boolean("is_correct").notNull(),
    pointsAwarded: integer("points_awarded").notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("live_session_answers_session_id_idx").on(table.sessionId),
    // One answer per participant per question — the DB-level guard against double submission.
    uniqueIndex("live_session_answers_participant_question_unique").on(
      table.participantId,
      table.questionIndex,
    ),
  ],
);

export type LiveSessionAnswer = typeof liveSessionAnswers.$inferSelect;
export type NewLiveSessionAnswer = typeof liveSessionAnswers.$inferInsert;
