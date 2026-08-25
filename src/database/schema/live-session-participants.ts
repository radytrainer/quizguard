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

import { liveSessions } from "@/database/schema/live-sessions";
import { students } from "@/database/schema/students";

// Mirrors LIVE_AVATARS in backend/live/live.schema.ts — kept as an independent literal list
// here (not imported) the same way quizzes.ts's quiz_status enum doesn't import from
// quiz.schema.ts's zod mirror, so this schema file stays free of any backend/* dependency.
export const liveParticipantAvatarEnum = pgEnum("live_participant_avatar", [
  "cat",
  "dog",
  "rabbit",
  "turtle",
  "bird",
  "fish",
  "panda",
  "squirrel",
]);

export const liveSessionParticipants = pgTable(
  "live_session_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => liveSessions.id, { onDelete: "cascade" }),
    // Exactly one of studentId/guestToken is set, enforced in live.service.ts's two join
    // functions (not a DB check constraint, matching this codebase's existing preference for
    // app-level invariants) — an authenticated join keys off the account, a guest join
    // (Section: anonymous "anyone with the code" play, no account) keys off a token the
    // client generates once and holds in sessionStorage for the tab's lifetime.
    studentId: uuid("student_id").references(() => students.userId, {
      onDelete: "cascade",
    }),
    guestToken: uuid("guest_token"),
    // Snapshotted at join time — for a guest there's no `users` row to join against for a name,
    // and for a student this also avoids a `users` join on every roster/leaderboard read, at
    // the cost of not reflecting a mid-game display-name change (irrelevant here: a live
    // session lasts minutes, not long enough for that to matter).
    displayName: text("display_name").notNull(),
    // Guests pick their own at the "what's your name" step; an authenticated student gets one
    // assigned at random server-side (see live.service.ts's pickRandomAvatar) — every
    // participant always has one, purely cosmetic (roster/leaderboard badge), never used for
    // identity or scoring.
    avatar: liveParticipantAvatarEnum("avatar").notNull().default("cat"),
    score: integer("score").notNull().default(0),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("live_session_participants_session_id_idx").on(table.sessionId),
    // One participant row per student per session — (re)joining upserts rather than
    // duplicates. Postgres treats every NULL as distinct, so this only constrains the
    // authenticated (non-null studentId) rows — guest rows are unconstrained by it.
    uniqueIndex("live_session_participants_session_student_unique").on(
      table.sessionId,
      table.studentId,
    ),
    // Mirrors the index above for guests: one row per guestToken per session, same NULL
    // semantics keeping it out of the authenticated rows' way.
    uniqueIndex("live_session_participants_session_guest_unique").on(
      table.sessionId,
      table.guestToken,
    ),
  ],
);

export type LiveSessionParticipant =
  typeof liveSessionParticipants.$inferSelect;
export type NewLiveSessionParticipant =
  typeof liveSessionParticipants.$inferInsert;
