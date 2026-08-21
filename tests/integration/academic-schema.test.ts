import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { db, pool } from "@/lib/db";
import {
  classStudents,
  classes,
  students,
  teachers,
  users,
} from "@/database/schema";
import { hashPassword } from "@/backend/auth/password";

// Requires `docker compose up -d` (PostgreSQL). Exercises the constraints defined in
// database/schema/{teachers,students,classes,class-students}.ts directly against Postgres —
// these are exactly the guarantees the schema design relies on, not implementation details.
describe("academic schema constraints (integration)", () => {
  const suffix = randomUUID().slice(0, 8);
  const teacherEmail = `schema-test-teacher-${suffix}@quizguard.test`;
  const studentEmail = `schema-test-student-${suffix}@quizguard.test`;
  const userIds: string[] = [];

  async function createUser(email: string, role: "teacher" | "student") {
    const passwordHash = await hashPassword("irrelevant");
    const [user] = await db
      .insert(users)
      .values({ email, name: email, role, passwordHash })
      .returning();
    userIds.push(user.id);
    return user;
  }

  afterAll(async () => {
    // Deleting classes first cascades to class_students automatically (ON DELETE CASCADE),
    // covering both the active and soft-deleted rows the constraint test leaves behind.
    await db.delete(classes).where(inArray(classes.teacherId, userIds));
    await db.delete(teachers).where(inArray(teachers.userId, userIds));
    await db.delete(students).where(inArray(students.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await pool.end();
  });

  it("rejects a class referencing a nonexistent teacher (FK constraint)", async () => {
    await expect(
      db.insert(classes).values({
        name: `Orphan Class ${suffix}`,
        teacherId: randomUUID(),
      }),
    ).rejects.toThrow();
  });

  it("enforces one active class per (teacher, name), but allows reuse after soft-delete", async () => {
    const teacher = await createUser(teacherEmail, "teacher");
    await db.insert(teachers).values({ userId: teacher.id });

    const className = `Constraint Test Class ${suffix}`;
    const [first] = await db
      .insert(classes)
      .values({ name: className, teacherId: teacher.id })
      .returning();

    await expect(
      db.insert(classes).values({ name: className, teacherId: teacher.id }),
    ).rejects.toThrow();

    await db
      .update(classes)
      .set({ deletedAt: new Date() })
      .where(eq(classes.id, first.id));

    await expect(
      db.insert(classes).values({ name: className, teacherId: teacher.id }),
    ).resolves.toBeDefined();
  });

  it("prevents enrolling the same student in the same class twice (composite PK)", async () => {
    const teacher = await createUser(`${teacherEmail}-2`, "teacher");
    await db.insert(teachers).values({ userId: teacher.id });
    const student = await createUser(studentEmail, "student");
    await db.insert(students).values({ userId: student.id });

    const [cls] = await db
      .insert(classes)
      .values({ name: `Enrollment Class ${suffix}`, teacherId: teacher.id })
      .returning();

    await db
      .insert(classStudents)
      .values({ classId: cls.id, studentId: student.id });

    await expect(
      db
        .insert(classStudents)
        .values({ classId: cls.id, studentId: student.id }),
    ).rejects.toThrow();
  });

  it("cascades class deletion to its enrollments", async () => {
    const teacher = await createUser(`${teacherEmail}-3`, "teacher");
    await db.insert(teachers).values({ userId: teacher.id });
    const student = await createUser(`${studentEmail}-3`, "student");
    await db.insert(students).values({ userId: student.id });

    const [cls] = await db
      .insert(classes)
      .values({ name: `Cascade Class ${suffix}`, teacherId: teacher.id })
      .returning();
    await db
      .insert(classStudents)
      .values({ classId: cls.id, studentId: student.id });

    await db.delete(classes).where(eq(classes.id, cls.id));

    const remaining = await db
      .select()
      .from(classStudents)
      .where(eq(classStudents.classId, cls.id));
    expect(remaining).toHaveLength(0);
  });

  it("blocks deleting a teacher who still owns a class (restrict)", async () => {
    const teacher = await createUser(`${teacherEmail}-4`, "teacher");
    await db.insert(teachers).values({ userId: teacher.id });
    await db
      .insert(classes)
      .values({ name: `Restrict Class ${suffix}`, teacherId: teacher.id });

    await expect(
      db.delete(teachers).where(eq(teachers.userId, teacher.id)),
    ).rejects.toThrow();
  });
});
