import {
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { liveSessions } from "@/database/schema/live-sessions";
import { students } from "@/database/schema/students";

export const liveSessionParticipants = pgTable(
  "live_session_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => liveSessions.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.userId, { onDelete: "cascade" }),
    score: integer("score").notNull().default(0),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("live_session_participants_session_id_idx").on(table.sessionId),
    // One participant row per student per session — (re)joining upserts rather than duplicates.
    uniqueIndex("live_session_participants_session_student_unique").on(
      table.sessionId,
      table.studentId,
    ),
  ],
);

export type LiveSessionParticipant =
  typeof liveSessionParticipants.$inferSelect;
export type NewLiveSessionParticipant =
  typeof liveSessionParticipants.$inferInsert;
