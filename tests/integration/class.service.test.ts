import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, pool } from "@/lib/db";
import { classes, students, teachers, users } from "@/database/schema";
import { hashPassword } from "@/backend/auth/password";
import type { AuthUser } from "@/backend/auth/session";
import {
  addStudentToClass,
  createClass,
  deleteClass,
  getClass,
  listClasses,
  listRoster,
  removeStudentFromClass,
  searchAvailableStudents,
  updateClass,
} from "@/backend/classes/class.service";

// Requires `docker compose up -d` (PostgreSQL).
describe("class.service (integration)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  let teacherId: string;
  let studentAId: string;
  let studentBId: string;
  let requester: AuthUser;

  beforeAll(async () => {
    const passwordHash = await hashPassword("irrelevant");

    const [teacher] = await db
      .insert(users)
      .values({
        email: `class-service-teacher-${suffix}@quizguard.test`,
        name: "Class Service Teacher",
        role: "teacher",
        passwordHash,
      })
      .returning();
    await db.insert(teachers).values({ userId: teacher.id });
    teacherId = teacher.id;
    userIds.push(teacher.id);
    requester = {
      id: teacher.id,
      email: teacher.email,
      name: teacher.name,
      role: "teacher",
    };

    const [studentA] = await db
      .insert(users)
      .values({
        email: `class-service-student-a-${suffix}@quizguard.test`,
        name: `Roster Student A ${suffix}`,
        role: "student",
        passwordHash,
      })
      .returning();
    await db.insert(students).values({ userId: studentA.id });
    studentAId = studentA.id;
    userIds.push(studentA.id);

    const [studentB] = await db
      .insert(users)
      .values({
        email: `class-service-student-b-${suffix}@quizguard.test`,
        name: `Roster Student B ${suffix}`,
        role: "student",
        passwordHash,
      })
      .returning();
    await db.insert(students).values({ userId: studentB.id });
    studentBId = studentB.id;
    userIds.push(studentB.id);
  });

  afterAll(async () => {
    await db.delete(classes).where(inArray(classes.teacherId, [teacherId]));
    await db.delete(teachers).where(inArray(teachers.userId, userIds));
    await db.delete(students).where(inArray(students.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await pool.end();
  });

  it("creates a class, defaulting teacherId to the author", async () => {
    const cls = await createClass(
      { name: `Default Owner ${suffix}` },
      teacherId,
    );
    expect(cls.teacherId).toBe(teacherId);
  });

  it("reports studentCount via getClass", async () => {
    const cls = await createClass(
      { name: `Roster Count ${suffix}` },
      teacherId,
    );
    const before = await getClass(cls.id, requester);
    expect(before.studentCount).toBe(0);

    await addStudentToClass(cls.id, studentAId, requester);
    const after = await getClass(cls.id, requester);
    expect(after.studentCount).toBe(1);
  });

  it("renames a class", async () => {
    const cls = await createClass(
      { name: `Rename Before ${suffix}` },
      teacherId,
    );
    const updated = await updateClass(
      cls.id,
      {
        name: `Rename After ${suffix}`,
      },
      requester,
    );
    expect(updated.name).toBe(`Rename After ${suffix}`);
  });

  it("soft-deletes: getClass 404s afterward", async () => {
    const cls = await createClass({ name: `Delete Me ${suffix}` }, teacherId);
    await deleteClass(cls.id, requester);
    await expect(getClass(cls.id, requester)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("filters listClasses by search", async () => {
    const cls = await createClass(
      { name: `Findable Class ${suffix}` },
      teacherId,
    );
    const result = await listClasses(
      {
        search: `Findable Class ${suffix}`,
        page: 1,
        pageSize: 20,
      },
      requester,
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe(cls.id);
  });

  it("adds, lists, and removes roster members", async () => {
    const cls = await createClass({ name: `Roster Ops ${suffix}` }, teacherId);

    await addStudentToClass(cls.id, studentAId, requester);
    await addStudentToClass(cls.id, studentBId, requester);

    const roster = await listRoster(cls.id, requester);
    expect(roster.map((r) => r.studentId).sort()).toEqual(
      [studentAId, studentBId].sort(),
    );

    await removeStudentFromClass(cls.id, studentAId, requester);
    const afterRemove = await listRoster(cls.id, requester);
    expect(afterRemove).toHaveLength(1);
    expect(afterRemove[0].studentId).toBe(studentBId);
  });

  it("rejects enrolling the same student twice", async () => {
    const cls = await createClass({ name: `Dup Enroll ${suffix}` }, teacherId);
    await addStudentToClass(cls.id, studentAId, requester);

    await expect(
      addStudentToClass(cls.id, studentAId, requester),
    ).rejects.toMatchObject({
      status: 409,
    });
  });

  it("404s removing a student who isn't enrolled", async () => {
    const cls = await createClass(
      { name: `Remove Missing ${suffix}` },
      teacherId,
    );
    await expect(
      removeStudentFromClass(cls.id, studentAId, requester),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("excludes already-enrolled students from searchAvailableStudents", async () => {
    const cls = await createClass({ name: `Available ${suffix}` }, teacherId);
    await addStudentToClass(cls.id, studentAId, requester);

    const available = await searchAvailableStudents(cls.id, suffix, requester);
    expect(available.some((s) => s.studentId === studentAId)).toBe(false);
    expect(available.some((s) => s.studentId === studentBId)).toBe(true);
  });
});
