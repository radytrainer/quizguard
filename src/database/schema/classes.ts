import { isNull } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { teachers } from "@/database/schema/teachers";

export const classes = pgTable(
  "classes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // restrict, not cascade: deleting a teacher shouldn't silently delete their classes (and
    // the quizzes/results that will hang off them from Phase 4+) — reassign first.
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.userId, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Soft delete: a class with quiz history (Phase 4+) shouldn't hard-delete.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("classes_teacher_id_idx").on(table.teacherId),
    // Partial (not plain) unique index: a teacher can reuse a class name after the original
    // is soft-deleted, but can't have two *active* classes with the same name.
    uniqueIndex("classes_teacher_id_name_active_unique")
      .on(table.teacherId, table.name)
      .where(isNull(table.deletedAt)),
  ],
);

export type Class = typeof classes.$inferSelect;
export type NewClass = typeof classes.$inferInsert;
