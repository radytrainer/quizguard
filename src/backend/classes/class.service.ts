import "server-only";

import {
  and,
  count,
  desc,
  eq,
  ilike,
  isNull,
  notInArray,
  or,
  sql,
} from "drizzle-orm";

import { conflict, forbidden, notFound } from "@/lib/api-response";
import { db } from "@/lib/db";
import {
  classes,
  classStudents,
  students,
  users,
  type Class,
  type Gender,
} from "@/database/schema";
import type { AuthUser } from "@/backend/auth/session";
import type {
  ClassInput,
  ClassListQuery,
  CreateStudentInput,
} from "@/backend/classes/class.schema";
import { assertOwner } from "@/backend/shared/ownership";
import {
  createStudentAccount,
  type PublicUser,
} from "@/backend/users/user.service";

export interface ClassWithRosterInfo extends Class {
  studentCount: number;
}

export interface ClassListResult {
  items: ClassWithRosterInfo[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RosterMember {
  studentId: string;
  name: string;
  email: string;
  studentNumber: string | null;
  gender: Gender | null;
}

async function requireActiveClass(id: string): Promise<Class> {
  const [row] = await db
    .select()
    .from(classes)
    .where(and(eq(classes.id, id), isNull(classes.deletedAt)))
    .limit(1);

  if (!row) throw notFound("Class not found");
  return row;
}

async function requireOwnedClass(
  id: string,
  requester: AuthUser,
): Promise<Class> {
  const row = await requireActiveClass(id);
  assertOwner(row.teacherId, requester, "This class does not belong to you");
  return row;
}

export async function createClass(
  input: ClassInput,
  authorId: string,
): Promise<Class> {
  const [row] = await db
    .insert(classes)
    .values({ name: input.name, teacherId: input.teacherId ?? authorId })
    .returning();
  return row;
}

export async function getClass(
  id: string,
  requester: AuthUser,
): Promise<ClassWithRosterInfo> {
  const row = await requireOwnedClass(id, requester);

  const [{ studentCount }] = await db
    .select({ studentCount: count() })
    .from(classStudents)
    .where(eq(classStudents.classId, id));

  return { ...row, studentCount };
}

export async function updateClass(
  id: string,
  input: ClassInput,
  requester: AuthUser,
): Promise<Class> {
  await requireOwnedClass(id, requester);

  const [row] = await db
    .update(classes)
    .set({
      name: input.name,
      // Reassigning a class to a different teacher is admin-only (class.schema.ts) — a
      // teacher-submitted teacherId is silently ignored rather than erroring, since the
      // teacher-facing UI never sends this field in the first place.
      ...(requester.role === "admin" && input.teacherId
        ? { teacherId: input.teacherId }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(classes.id, id))
    .returning();

  return row;
}

export async function deleteClass(
  id: string,
  requester: AuthUser,
): Promise<void> {
  await requireOwnedClass(id, requester);
  await db
    .update(classes)
    .set({ deletedAt: new Date() })
    .where(eq(classes.id, id));
}

export async function listClasses(
  query: ClassListQuery,
  requester: AuthUser,
): Promise<ClassListResult> {
  const conditions = [isNull(classes.deletedAt)];
  if (requester.role !== "admin") {
    conditions.push(eq(classes.teacherId, requester.id));
  }
  if (query.search) conditions.push(ilike(classes.name, `%${query.search}%`));

  const where = and(...conditions);

  const [{ total }] = await db
    .select({ total: count() })
    .from(classes)
    .where(where);

  const items = await db
    .select({
      id: classes.id,
      name: classes.name,
      teacherId: classes.teacherId,
      createdAt: classes.createdAt,
      updatedAt: classes.updatedAt,
      deletedAt: classes.deletedAt,
      studentCount: sql<number>`count(${classStudents.studentId})`.mapWith(
        Number,
      ),
    })
    .from(classes)
    .leftJoin(classStudents, eq(classStudents.classId, classes.id))
    .where(where)
    .groupBy(classes.id)
    .orderBy(desc(classes.createdAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function listRoster(
  classId: string,
  requester: AuthUser,
): Promise<RosterMember[]> {
  await requireOwnedClass(classId, requester);

  return db
    .select({
      studentId: students.userId,
      name: users.name,
      email: users.email,
      studentNumber: students.studentNumber,
      gender: students.gender,
    })
    .from(classStudents)
    .innerJoin(students, eq(students.userId, classStudents.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .where(eq(classStudents.classId, classId))
    .orderBy(users.name);
}

export async function addStudentToClass(
  classId: string,
  studentId: string,
  requester: AuthUser,
): Promise<void> {
  await requireOwnedClass(classId, requester);

  const [student] = await db
    .select({ userId: students.userId })
    .from(students)
    .where(eq(students.userId, studentId))
    .limit(1);
  if (!student) throw notFound("Student not found");

  const [existing] = await db
    .select({ classId: classStudents.classId })
    .from(classStudents)
    .where(
      and(
        eq(classStudents.classId, classId),
        eq(classStudents.studentId, studentId),
      ),
    )
    .limit(1);
  if (existing) throw conflict("Student is already enrolled in this class");

  await db.insert(classStudents).values({ classId, studentId });
}

// Creates a brand-new student account and immediately enrolls it — distinct from
// addStudentToClass, which only attaches an already-existing student found via search.
export async function createStudentInClass(
  classId: string,
  input: CreateStudentInput,
  requester: AuthUser,
): Promise<PublicUser> {
  await requireOwnedClass(classId, requester);
  const user = await createStudentAccount(input);
  await addStudentToClass(classId, user.id, requester);
  return user;
}

export async function removeStudentFromClass(
  classId: string,
  studentId: string,
  requester: AuthUser,
): Promise<void> {
  await requireOwnedClass(classId, requester);

  const deleted = await db
    .delete(classStudents)
    .where(
      and(
        eq(classStudents.classId, classId),
        eq(classStudents.studentId, studentId),
      ),
    )
    .returning({ classId: classStudents.classId });

  if (deleted.length === 0)
    throw notFound("Student is not enrolled in this class");
}

/** Active students not already enrolled in the given class, for the roster "add student" search. */
export async function searchAvailableStudents(
  classId: string,
  search: string | undefined,
  requester: AuthUser,
): Promise<RosterMember[]> {
  await requireOwnedClass(classId, requester);

  const enrolled = await db
    .select({ studentId: classStudents.studentId })
    .from(classStudents)
    .where(eq(classStudents.classId, classId));
  const enrolledIds = enrolled.map((row) => row.studentId);

  const conditions = [eq(users.role, "student"), isNull(users.deletedAt)];
  if (search) {
    const term = `%${search}%`;
    conditions.push(or(ilike(users.name, term), ilike(users.email, term))!);
  }
  if (enrolledIds.length > 0) {
    conditions.push(notInArray(students.userId, enrolledIds));
  }

  return db
    .select({
      studentId: students.userId,
      name: users.name,
      email: users.email,
      studentNumber: students.studentNumber,
      gender: students.gender,
    })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .where(and(...conditions))
    .orderBy(users.name)
    .limit(20);
}

/** Guards the teacher-facing student-account edit/delete routes (api/students/[id]) — unlike
 * the roster actions above, editing/deleting a student's *account* isn't scoped to one class,
 * so this checks across every class the requester owns rather than reusing requireOwnedClass
 * against a single classId. Admin bypasses, same as assertOwner. */
export async function assertStudentInTeachersRoster(
  studentId: string,
  requester: AuthUser,
): Promise<void> {
  if (requester.role === "admin") return;

  const [row] = await db
    .select({ classId: classStudents.classId })
    .from(classStudents)
    .innerJoin(classes, eq(classes.id, classStudents.classId))
    .where(
      and(
        eq(classStudents.studentId, studentId),
        eq(classes.teacherId, requester.id),
        isNull(classes.deletedAt),
      ),
    )
    .limit(1);

  if (!row) throw forbidden("This student is not in one of your classes");
}
