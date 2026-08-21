import "server-only";

import { and, eq, ilike, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { students, users } from "@/database/schema";

export interface StudentSummary {
  studentId: string;
  name: string;
  email: string;
  studentNumber: string | null;
}

/** Active student accounts, for teacher-facing pickers (roster search, direct quiz assignment). */
export async function searchStudents(
  search: string | undefined,
): Promise<StudentSummary[]> {
  const conditions = [eq(users.role, "student"), isNull(users.deletedAt)];
  if (search) {
    const term = `%${search}%`;
    conditions.push(or(ilike(users.name, term), ilike(users.email, term))!);
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
