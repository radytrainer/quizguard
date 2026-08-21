import {
  index,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { classes } from "@/database/schema/classes";
import { students } from "@/database/schema/students";

/**
 * Class enrollment (many-to-many). Composite PK, not a surrogate `id` — this table has no
 * identity beyond "this student is in this class", and the PK doubles as the natural index
 * for "students in a class"; `student_id` gets its own index for the reverse lookup. No
 * `updatedAt`: membership is added or removed, never edited in place.
 */
export const classStudents = pgTable(
  "class_students",
  {
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.userId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.classId, table.studentId] }),
    index("class_students_student_id_idx").on(table.studentId),
  ],
);

export type ClassStudent = typeof classStudents.$inferSelect;
export type NewClassStudent = typeof classStudents.$inferInsert;
