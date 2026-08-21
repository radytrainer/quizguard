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

import { conflict, notFound } from "@/lib/api-response";
import { db } from "@/lib/db";
import {
  classes,
  classStudents,
  students,
  users,
  type Class,
} from "@/database/schema";
import type {
  ClassInput,
  ClassListQuery,
  CreateStudentInput,
} from "@/backend/classes/class.schema";
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

export async function getClass(id: string): Promise<ClassWithRosterInfo> {
  const row = await requireActiveClass(id);

  const [{ studentCount }] = await db
    .select({ studentCount: count() })
    .from(classStudents)
    .where(eq(classStudents.classId, id));

  return { ...row, studentCount };
}

export async function updateClass(
  id: string,
  input: ClassInput,
): Promise<Class> {
  await requireActiveClass(id);

  const [row] = await db
    .update(classes)
    .set({
      name: input.name,
      ...(input.teacherId ? { teacherId: input.teacherId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(classes.id, id))
    .returning();

  return row;
}

export async function deleteClass(id: string): Promise<void> {
  await requireActiveClass(id);
  await db
    .update(classes)
    .set({ deletedAt: new Date() })
    .where(eq(classes.id, id));
}

export async function listClasses(
  query: ClassListQuery,
): Promise<ClassListResult> {
  const conditions = [isNull(classes.deletedAt)];
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

export async function listRoster(classId: string): Promise<RosterMember[]> {
  await requireActiveClass(classId);

  return db
    .select({
      studentId: students.userId,
      name: users.name,
      email: users.email,
      studentNumber: students.studentNumber,
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
): Promise<void> {
  await requireActiveClass(classId);

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
// Caller (the API route) is responsible for verifying the requester may manage this class;
// this function only checks the class itself still exists.
export async function createStudentInClass(
  classId: string,
  input: CreateStudentInput,
): Promise<PublicUser> {
  await requireActiveClass(classId);
  const user = await createStudentAccount(input);
  await addStudentToClass(classId, user.id);
  return user;
}

export async function removeStudentFromClass(
  classId: string,
  studentId: string,
): Promise<void> {
  await requireActiveClass(classId);

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
): Promise<RosterMember[]> {
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
    })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .where(and(...conditions))
    .orderBy(users.name)
    .limit(20);
}
