import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "@/database/schema/users";

export const genderEnum = pgEnum("gender", ["male", "female", "other"]);

/**
 * Extends a `users` row (role = 'student') with student-specific data — see teachers.ts for
 * why this is a separate table rather than extra columns on `users`.
 */
export const students = pgTable("students", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // External roll number / ID, e.g. from a school SIS. Nullable: assigned at enrollment, not
  // account creation, and Postgres unique constraints already allow multiple NULLs.
  studentNumber: text("student_number").unique(),
  // Nullable: required going forward for accounts created through the admin/teacher "add
  // student" flows, but accounts created before this field existed have none on record.
  gender: genderEnum("gender"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
export type Gender = (typeof genderEnum.enumValues)[number];
