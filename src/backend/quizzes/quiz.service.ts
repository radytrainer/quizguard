import "server-only";

import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  sql,
} from "drizzle-orm";

import { conflict, notFound } from "@/lib/api-response";
import { db } from "@/lib/db";
import {
  classStudents,
  examAttempts,
  questions,
  quizAssignments,
  quizQuestions,
  quizzes,
  type Quiz,
  type QuizStatus,
} from "@/database/schema";
import type { QuizInput, QuizListQuery } from "@/backend/quizzes/quiz.schema";

export interface QuizWithPoolInfo extends Quiz {
  questionCount: number;
}

// "scheduled" isn't a stored value — it's `published` with a `startAt` still in the future.
// Kept as a derived display concept rather than a fourth database status so "is this quiz
// live" logic elsewhere in the app only ever has to check the one real `status` column.
export type QuizDisplayStatus = QuizStatus | "scheduled";

export function toDisplayStatus(quiz: {
  status: QuizStatus;
  startAt: Date | null;
}): QuizDisplayStatus {
  if (
    quiz.status === "published" &&
    quiz.startAt &&
    quiz.startAt > new Date()
  ) {
    return "scheduled";
  }
  return quiz.status;
}

export interface QuizListItem extends QuizWithPoolInfo {
  displayStatus: QuizDisplayStatus;
  studentCount: number;
  // Distinct students with at least one exam attempt (any status) — "assigned" (studentCount)
  // only says who *can* take it, this says who actually has, at a glance from the list page
  // without opening Attempts.
  joinedCount: number;
}

export interface QuizListResult {
  items: QuizListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PooledQuestion {
  id: string;
  type: string;
  subject: string;
  category: string | null;
  difficulty: string;
  points: number;
  text: string;
  position: number;
}

function toQuizValues(input: QuizInput) {
  return {
    title: input.title,
    description: input.description ? input.description : null,
    subject: input.subject,
    durationMinutes: input.durationMinutes,
    passingScore: input.passingScore,
    maxAttempts: input.maxAttempts,
    startAt: input.startAt ?? null,
    endAt: input.endAt ?? null,
    randomizeQuestions: input.randomizeQuestions,
    randomizeOptions: input.randomizeOptions,
    fullscreenRequired: input.fullscreenRequired,
    monitorActivity: input.monitorActivity,
    autoSave: input.autoSave,
    autoSubmit: input.autoSubmit,
    showResults: input.showResults,
    questionsPerAttempt: input.questionsPerAttempt,
  };
}

async function requireActiveQuiz(id: string): Promise<Quiz> {
  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(and(eq(quizzes.id, id), isNull(quizzes.deletedAt)))
    .limit(1);

  if (!quiz) throw notFound("Quiz not found");
  return quiz;
}

export async function createQuiz(
  input: QuizInput,
  authorId: string,
): Promise<Quiz> {
  const [quiz] = await db
    .insert(quizzes)
    .values({ ...toQuizValues(input), createdBy: authorId })
    .returning();
  return quiz;
}

export async function getQuiz(id: string): Promise<QuizWithPoolInfo> {
  const quiz = await requireActiveQuiz(id);

  const [{ questionCount }] = await db
    .select({ questionCount: count() })
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, id));

  return { ...quiz, questionCount };
}

export async function updateQuiz(id: string, input: QuizInput): Promise<Quiz> {
  await requireActiveQuiz(id);

  const [quiz] = await db
    .update(quizzes)
    .set({ ...toQuizValues(input), updatedAt: new Date() })
    .where(eq(quizzes.id, id))
    .returning();

  return quiz;
}

export async function deleteQuiz(id: string): Promise<void> {
  await requireActiveQuiz(id);
  await db
    .update(quizzes)
    .set({ deletedAt: new Date() })
    .where(eq(quizzes.id, id));
}

async function setQuizStatus(id: string, status: QuizStatus): Promise<Quiz> {
  await requireActiveQuiz(id);

  const [quiz] = await db
    .update(quizzes)
    .set({ status, updatedAt: new Date() })
    .where(eq(quizzes.id, id))
    .returning();

  return quiz;
}

export async function publishQuiz(id: string): Promise<Quiz> {
  const quiz = await requireActiveQuiz(id);

  const [{ questionCount }] = await db
    .select({ questionCount: count() })
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, id));

  if (questionCount === 0) {
    throw conflict("Add at least one question before publishing");
  }
  if (questionCount < quiz.questionsPerAttempt) {
    throw conflict(
      `Question pool (${questionCount}) is smaller than questions per attempt (${quiz.questionsPerAttempt})`,
    );
  }

  return setQuizStatus(id, "published");
}

export async function unpublishQuiz(id: string): Promise<Quiz> {
  return setQuizStatus(id, "draft");
}

export async function archiveQuiz(id: string): Promise<Quiz> {
  return setQuizStatus(id, "archived");
}

export async function duplicateQuiz(
  id: string,
  authorId: string,
): Promise<Quiz> {
  const original = await requireActiveQuiz(id);
  const pool = await db
    .select({
      questionId: quizQuestions.questionId,
      position: quizQuestions.position,
    })
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, id));

  return db.transaction(async (tx) => {
    const [copy] = await tx
      .insert(quizzes)
      .values({
        ...toQuizValues({
          title: `${original.title} (Copy)`,
          description: original.description ?? undefined,
          subject: original.subject,
          durationMinutes: original.durationMinutes,
          passingScore: original.passingScore,
          maxAttempts: original.maxAttempts,
          startAt: original.startAt ?? undefined,
          endAt: original.endAt ?? undefined,
          randomizeQuestions: original.randomizeQuestions,
          randomizeOptions: original.randomizeOptions,
          fullscreenRequired: original.fullscreenRequired,
          monitorActivity: original.monitorActivity,
          autoSave: original.autoSave,
          autoSubmit: original.autoSubmit,
          showResults: original.showResults,
          questionsPerAttempt: original.questionsPerAttempt,
        }),
        createdBy: authorId,
      })
      .returning();

    if (pool.length > 0) {
      await tx.insert(quizQuestions).values(
        pool.map((row) => ({
          quizId: copy.id,
          questionId: row.questionId,
          position: row.position,
        })),
      );
    }

    return copy;
  });
}

export async function setQuizQuestionPool(
  quizId: string,
  questionIds: string[],
): Promise<void> {
  await requireActiveQuiz(quizId);

  await db.transaction(async (tx) => {
    await tx.delete(quizQuestions).where(eq(quizQuestions.quizId, quizId));
    if (questionIds.length > 0) {
      await tx.insert(quizQuestions).values(
        questionIds.map((questionId, index) => ({
          quizId,
          questionId,
          position: index,
        })),
      );
    }
  });
}

export async function getQuizQuestionPool(
  quizId: string,
): Promise<PooledQuestion[]> {
  return db
    .select({
      id: questions.id,
      type: questions.type,
      subject: questions.subject,
      category: questions.category,
      difficulty: questions.difficulty,
      points: questions.points,
      text: questions.text,
      position: quizQuestions.position,
    })
    .from(quizQuestions)
    .innerJoin(questions, eq(quizQuestions.questionId, questions.id))
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.position);
}

export async function getQuizFilterFacets(): Promise<{ subjects: string[] }> {
  const rows = await db
    .selectDistinct({ subject: quizzes.subject })
    .from(quizzes)
    .where(isNull(quizzes.deletedAt));
  return { subjects: rows.map((r) => r.subject).sort() };
}

/** Distinct students reachable through a set of quizzes' assignments — the union of each
 * assigned class's roster and each individually-assigned student. Deliberately a separate
 * query per quiz (not one joined into the main paginated query below): joining
 * quiz_assignments/class_students alongside quiz_questions in a single GROUP BY would fan out
 * multiplicatively (one row per question × per roster member), corrupting both counts. Same
 * reasoning as backend/dashboard/dashboard.service.ts's own student-counting approach, just
 * scoped to one page of quiz ids instead of one teacher's whole portfolio. */
async function studentCountsByQuiz(
  quizIds: string[],
): Promise<Map<string, number>> {
  if (quizIds.length === 0) return new Map();

  const [classRosterRows, individualRows] = await Promise.all([
    db
      .select({
        quizId: quizAssignments.quizId,
        studentId: classStudents.studentId,
      })
      .from(quizAssignments)
      .innerJoin(
        classStudents,
        eq(classStudents.classId, quizAssignments.classId),
      )
      .where(inArray(quizAssignments.quizId, quizIds)),
    db
      .select({
        quizId: quizAssignments.quizId,
        studentId: quizAssignments.studentId,
      })
      .from(quizAssignments)
      .where(
        and(
          inArray(quizAssignments.quizId, quizIds),
          isNull(quizAssignments.classId),
        ),
      ),
  ]);

  const studentsByQuiz = new Map<string, Set<string>>();
  for (const row of [...classRosterRows, ...individualRows]) {
    if (!row.studentId) continue;
    const set = studentsByQuiz.get(row.quizId) ?? new Set<string>();
    set.add(row.studentId);
    studentsByQuiz.set(row.quizId, set);
  }

  return new Map(
    [...studentsByQuiz.entries()].map(([quizId, set]) => [quizId, set.size]),
  );
}

/** Distinct students who've actually started an attempt (in progress or finished, any
 * status) — unlike studentCountsByQuiz above, this only reads exam_attempts, so it's a single
 * grouped aggregate rather than a union of two sources. */
async function joinedCountsByQuiz(
  quizIds: string[],
): Promise<Map<string, number>> {
  if (quizIds.length === 0) return new Map();

  const rows = await db
    .select({
      quizId: examAttempts.quizId,
      joined: sql<number>`count(distinct ${examAttempts.studentId})`.mapWith(
        Number,
      ),
    })
    .from(examAttempts)
    .where(inArray(examAttempts.quizId, quizIds))
    .groupBy(examAttempts.quizId);

  return new Map(rows.map((row) => [row.quizId, row.joined]));
}

export async function listQuizzes(
  query: QuizListQuery,
): Promise<QuizListResult> {
  const conditions = [isNull(quizzes.deletedAt)];

  if (query.search) conditions.push(ilike(quizzes.title, `%${query.search}%`));
  if (query.subject) conditions.push(eq(quizzes.subject, query.subject));
  if (query.status === "scheduled") {
    conditions.push(
      eq(quizzes.status, "published"),
      gt(quizzes.startAt, new Date()),
    );
  } else if (query.status) {
    conditions.push(eq(quizzes.status, query.status));
  }
  if (query.date) {
    const dayStart = new Date(query.date);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    conditions.push(
      gte(quizzes.startAt, dayStart),
      lt(quizzes.startAt, dayEnd),
    );
  }
  if (query.classId) {
    const assigned = await db
      .selectDistinct({ quizId: quizAssignments.quizId })
      .from(quizAssignments)
      .where(eq(quizAssignments.classId, query.classId));
    const assignedIds = assigned.map((a) => a.quizId);
    // An empty match set still has to exclude every quiz, not fall through to "no filter" —
    // inArray() with an empty array is always false, which is exactly that behavior.
    conditions.push(inArray(quizzes.id, assignedIds));
  }

  const where = and(...conditions);

  const [{ total }] = await db
    .select({ total: count() })
    .from(quizzes)
    .where(where);

  const rows = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      description: quizzes.description,
      subject: quizzes.subject,
      durationMinutes: quizzes.durationMinutes,
      passingScore: quizzes.passingScore,
      maxAttempts: quizzes.maxAttempts,
      startAt: quizzes.startAt,
      endAt: quizzes.endAt,
      randomizeQuestions: quizzes.randomizeQuestions,
      randomizeOptions: quizzes.randomizeOptions,
      fullscreenRequired: quizzes.fullscreenRequired,
      monitorActivity: quizzes.monitorActivity,
      autoSave: quizzes.autoSave,
      autoSubmit: quizzes.autoSubmit,
      showResults: quizzes.showResults,
      questionsPerAttempt: quizzes.questionsPerAttempt,
      status: quizzes.status,
      createdBy: quizzes.createdBy,
      createdAt: quizzes.createdAt,
      updatedAt: quizzes.updatedAt,
      deletedAt: quizzes.deletedAt,
      questionCount: sql<number>`count(${quizQuestions.questionId})`.mapWith(
        Number,
      ),
    })
    .from(quizzes)
    .leftJoin(quizQuestions, eq(quizQuestions.quizId, quizzes.id))
    .where(where)
    .groupBy(quizzes.id)
    .orderBy(desc(quizzes.createdAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const quizIds = rows.map((r) => r.id);
  const [studentCounts, joinedCounts] = await Promise.all([
    studentCountsByQuiz(quizIds),
    joinedCountsByQuiz(quizIds),
  ]);
  const items: QuizListItem[] = rows.map((row) => ({
    ...row,
    displayStatus: toDisplayStatus(row),
    studentCount: studentCounts.get(row.id) ?? 0,
    joinedCount: joinedCounts.get(row.id) ?? 0,
  }));

  return { items, total, page: query.page, pageSize: query.pageSize };
}
