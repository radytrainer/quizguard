import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  classStudents,
  classes,
  students,
  teachers,
  type User,
} from "@/database/schema";
import { hashPassword } from "@/backend/auth/password";
import { TEST_PASSWORD } from "@/database/seed/users.seed";
import { upsertUser } from "@/database/seed/upsert-user";

const extraStudents = [
  { email: "student2@quizguard.test", name: "Ravi Rahman" },
  { email: "student3@quizguard.test", name: "Lina Chen" },
  { email: "student4@quizguard.test", name: "Marco Silva" },
  { email: "student5@quizguard.test", name: "Priya Nair" },
];

const SAMPLE_CLASS_NAME = "Sample Class — Section A";

export async function seedAcademicData(primary: {
  teacher: User;
  student: User;
}): Promise<void> {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const additionalStudents = await Promise.all(
    extraStudents.map((student) =>
      upsertUser({ ...student, role: "student" }, passwordHash),
    ),
  );
  const allStudents = [primary.student, ...additionalStudents];

  // One transaction: a class with no roster, or students with no class, isn't a useful seed
  // state to leave behind if something fails partway through (Section 4 — Transactions).
  await db.transaction(async (tx) => {
    await tx
      .insert(teachers)
      .values({ userId: primary.teacher.id })
      .onConflictDoNothing();

    for (const [index, student] of allStudents.entries()) {
      await tx
        .insert(students)
        .values({
          userId: student.id,
          studentNumber: `S-${String(index + 1).padStart(4, "0")}`,
        })
        .onConflictDoNothing();
    }

    // `where` must mirror the partial unique index's predicate (classes_teacher_id_name_
    // active_unique is `WHERE deleted_at IS NULL`) — Postgres can't infer a conflict target
    // against a partial index otherwise.
    const [sampleClass] = await tx
      .insert(classes)
      .values({ name: SAMPLE_CLASS_NAME, teacherId: primary.teacher.id })
      .onConflictDoNothing({
        target: [classes.teacherId, classes.name],
        where: isNull(classes.deletedAt),
      })
      .returning();

    const classRow =
      sampleClass ??
      (
        await tx
          .select()
          .from(classes)
          .where(
            and(
              eq(classes.teacherId, primary.teacher.id),
              eq(classes.name, SAMPLE_CLASS_NAME),
              isNull(classes.deletedAt),
            ),
          )
          .limit(1)
      )[0];

    for (const student of allStudents) {
      await tx
        .insert(classStudents)
        .values({ classId: classRow.id, studentId: student.id })
        .onConflictDoNothing();
    }
  });

  console.log(
    `Seeded 1 class ("${SAMPLE_CLASS_NAME}") with ${allStudents.length} enrolled students`,
  );
}
