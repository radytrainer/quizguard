import { isNotNull, sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { classes } from "@/database/schema/classes";
import { quizzes } from "@/database/schema/quizzes";
import { students } from "@/database/schema/students";
import { users } from "@/database/schema/users";

/**
 * Assigns a published quiz to either a whole class or one individual student — never both,
 * enforced by the CHECK constraint below rather than in application code, since this table has
 * no other gate in front of it (e.g. a future bulk-import path). `startAt`/`endAt` are optional
 * per-assignment overrides of the quiz's own scheduling window (Section 7); null means "use the
 * quiz's own dates". Exam-taking itself is Phase 7 — this table only records who a quiz was
 * handed to and when.
 */
export const quizAssignments = pgTable(
  "quiz_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    classId: uuid("class_id").references(() => classes.id, {
      onDelete: "cascade",
    }),
    studentId: uuid("student_id").references(() => students.userId, {
      onDelete: "cascade",
    }),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    assignedBy: uuid("assigned_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("quiz_assignments_quiz_id_idx").on(table.quizId),
    index("quiz_assignments_class_id_idx").on(table.classId),
    index("quiz_assignments_student_id_idx").on(table.studentId),
    check(
      "quiz_assignments_target_xor",
      sql`(${table.classId} is not null and ${table.studentId} is null) or (${table.classId} is null and ${table.studentId} is not null)`,
    ),
    uniqueIndex("quiz_assignments_quiz_class_unique")
      .on(table.quizId, table.classId)
      .where(isNotNull(table.classId)),
    uniqueIndex("quiz_assignments_quiz_student_unique")
      .on(table.quizId, table.studentId)
      .where(isNotNull(table.studentId)),
  ],
);

export type QuizAssignment = typeof quizAssignments.$inferSelect;
export type NewQuizAssignment = typeof quizAssignments.$inferInsert;
