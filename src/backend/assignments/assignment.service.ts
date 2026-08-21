import "server-only";

import { and, eq, inArray, isNull, or } from "drizzle-orm";

import { conflict, notFound } from "@/lib/api-response";
import { db } from "@/lib/db";
import {
  classStudents,
  classes,
  quizAssignments,
  quizzes,
  users,
  type QuizAssignment,
} from "@/database/schema";
import type { AssignmentInput } from "@/backend/assignments/assignment.schema";

export interface AssignmentListItem extends QuizAssignment {
  targetName: string;
}

export interface StudentAssignment {
  id: string;
  quizId: string;
  quizTitle: string;
  subject: string;
  durationMinutes: number;
  passingScore: number;
  maxAttempts: number;
  questionsPerAttempt: number;
  fullscreenRequired: boolean;
  monitorActivity: boolean;
  autoSave: boolean;
  status: string;
  startAt: Date | null;
  endAt: Date | null;
  assignedVia: "class" | "student";
}

async function requirePublishedQuiz(quizId: string) {
  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(and(eq(quizzes.id, quizId), isNull(quizzes.deletedAt)))
    .limit(1);

  if (!quiz) throw notFound("Quiz not found");
  if (quiz.status !== "published") {
    throw conflict("Only published quizzes can be assigned");
  }
  return quiz;
}

export async function createAssignment(
  quizId: string,
  input: AssignmentInput,
  assignedBy: string,
): Promise<QuizAssignment> {
  await requirePublishedQuiz(quizId);

  if (input.classId) {
    const [target] = await db
      .select({ id: classes.id })
      .from(classes)
      .where(and(eq(classes.id, input.classId), isNull(classes.deletedAt)))
      .limit(1);
    if (!target) throw notFound("Class not found");
  }

  const [existing] = await db
    .select({ id: quizAssignments.id })
    .from(quizAssignments)
    .where(
      and(
        eq(quizAssignments.quizId, quizId),
        input.classId
          ? eq(quizAssignments.classId, input.classId)
          : eq(quizAssignments.studentId, input.studentId!),
      ),
    )
    .limit(1);
  if (existing) throw conflict("This quiz is already assigned to that target");

  const [row] = await db
    .insert(quizAssignments)
    .values({
      quizId,
      classId: input.classId ?? null,
      studentId: input.studentId ?? null,
      startAt: input.startAt ?? null,
      endAt: input.endAt ?? null,
      assignedBy,
    })
    .returning();

  return row;
}

export async function listAssignmentsForQuiz(
  quizId: string,
): Promise<AssignmentListItem[]> {
  const rows = await db
    .select({
      assignment: quizAssignments,
      className: classes.name,
      studentName: users.name,
    })
    .from(quizAssignments)
    .leftJoin(classes, eq(classes.id, quizAssignments.classId))
    .leftJoin(users, eq(users.id, quizAssignments.studentId))
    .where(eq(quizAssignments.quizId, quizId))
    .orderBy(quizAssignments.createdAt);

  return rows.map((row) => ({
    ...row.assignment,
    targetName: row.className ?? row.studentName ?? "Unknown",
  }));
}

export async function deleteAssignment(
  quizId: string,
  assignmentId: string,
): Promise<void> {
  const deleted = await db
    .delete(quizAssignments)
    .where(
      and(
        eq(quizAssignments.id, assignmentId),
        eq(quizAssignments.quizId, quizId),
      ),
    )
    .returning({ id: quizAssignments.id });

  if (deleted.length === 0) throw notFound("Assignment not found");
}

export async function listAssignmentsForStudent(
  studentId: string,
): Promise<StudentAssignment[]> {
  const enrolledClasses = await db
    .select({ classId: classStudents.classId })
    .from(classStudents)
    .where(eq(classStudents.studentId, studentId));
  const classIds = enrolledClasses.map((row) => row.classId);

  const targetCondition =
    classIds.length > 0
      ? or(
          eq(quizAssignments.studentId, studentId),
          inArray(quizAssignments.classId, classIds),
        )!
      : eq(quizAssignments.studentId, studentId);

  const rows = await db
    .select({
      id: quizAssignments.id,
      quizId: quizAssignments.quizId,
      classId: quizAssignments.classId,
      startAt: quizAssignments.startAt,
      endAt: quizAssignments.endAt,
      quizTitle: quizzes.title,
      subject: quizzes.subject,
      durationMinutes: quizzes.durationMinutes,
      passingScore: quizzes.passingScore,
      maxAttempts: quizzes.maxAttempts,
      questionsPerAttempt: quizzes.questionsPerAttempt,
      fullscreenRequired: quizzes.fullscreenRequired,
      monitorActivity: quizzes.monitorActivity,
      autoSave: quizzes.autoSave,
      status: quizzes.status,
      quizStartAt: quizzes.startAt,
      quizEndAt: quizzes.endAt,
    })
    .from(quizAssignments)
    .innerJoin(quizzes, eq(quizzes.id, quizAssignments.quizId))
    .where(
      and(
        targetCondition,
        eq(quizzes.status, "published"),
        isNull(quizzes.deletedAt),
      ),
    )
    .orderBy(quizzes.title);

  return rows.map((row) => ({
    id: row.id,
    quizId: row.quizId,
    quizTitle: row.quizTitle,
    subject: row.subject,
    durationMinutes: row.durationMinutes,
    passingScore: row.passingScore,
    maxAttempts: row.maxAttempts,
    questionsPerAttempt: row.questionsPerAttempt,
    fullscreenRequired: row.fullscreenRequired,
    monitorActivity: row.monitorActivity,
    autoSave: row.autoSave,
    status: row.status,
    startAt: row.startAt ?? row.quizStartAt,
    endAt: row.endAt ?? row.quizEndAt,
    assignedVia: row.classId ? "class" : "student",
  }));
}
