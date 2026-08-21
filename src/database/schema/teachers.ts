import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "@/database/schema/users";

/**
 * Extends a `users` row (role = 'teacher') with teacher-specific data. Currently just a FK
 * anchor: it lets `classes.teacher_id` reference *specifically* a teacher rather than any
 * user, enforcing "only teachers own classes" at the database level. Add columns here (e.g.
 * department) only once a phase actually needs them — see docs/ARCHITECTURE.md — Section 4.
 */
export const teachers = pgTable("teachers", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Teacher = typeof teachers.$inferSelect;
export type NewTeacher = typeof teachers.$inferInsert;
