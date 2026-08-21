import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import {
  getStudentName,
  publishRealtimeEvent,
} from "@/backend/realtime/realtime.service";
import { notFound } from "@/lib/api-response";
import { db } from "@/lib/db";
import {
  attemptLockEvents,
  examAnswers,
  examAttemptQuestions,
  examAttempts,
  examViolations,
  questionOptions,
  questions,
  quizzes,
  users,
  type AttemptStatus,
  type ExamAttempt,
  type ViolationType,
} from "@/database/schema";
import type { RecordViolationInput } from "@/backend/monitoring/monitoring.schema";

/** Records the violation, and — for a fullscreen exit on a quiz that requires fullscreen —
 * locks the attempt so no further answers/submission are accepted until a teacher unlocks it
 * (Section 10). Returns whether this call locked the attempt, so the API route can tell the
 * student's own tab immediately without waiting on the realtime round trip. */
export async function recordViolation(
  attempt: ExamAttempt,
  input: RecordViolationInput,
): Promise<boolean> {
  await db
    .insert(examViolations)
    .values({ attemptId: attempt.id, type: input.type });

  let locked = false;
  if (input.type === "fullscreen_exit") {
    const [quiz] = await db
      .select({ fullscreenRequired: quizzes.fullscreenRequired })
      .from(quizzes)
      .where(eq(quizzes.id, attempt.quizId))
      .limit(1);
    if (quiz?.fullscreenRequired) {
      locked = true;
      await db
        .update(examAttempts)
        .set({ locked: true, lockedAt: new Date() })
        .where(eq(examAttempts.id, attempt.id));
      await db
        .insert(attemptLockEvents)
        .values({ attemptId: attempt.id, action: "locked" });
    }
  }

  void publishRealtimeEvent({
    type: "violation",
    quizId: attempt.quizId,
    attemptId: attempt.id,
    studentId: attempt.studentId,
    studentName: await getStudentName(attempt.studentId),
    violationType: input.type,
    locked,
    occurredAt: new Date().toISOString(),
  });

  return locked;
}

/** Teacher-only escape hatch for a locked attempt (Section 10) — a no-op if it's already
 * unlocked, so a double-click or a stale UI can't error. */
export async function unlockAttempt(
  quizId: string,
  attemptId: string,
): Promise<void> {
  const [attempt] = await db
    .select()
    .from(examAttempts)
    .where(and(eq(examAttempts.id, attemptId), eq(examAttempts.quizId, quizId)))
    .limit(1);
  if (!attempt) throw notFound("Attempt not found");
  if (!attempt.locked) return;

  await db
    .update(examAttempts)
    .set({ locked: false, lockedAt: null })
    .where(eq(examAttempts.id, attemptId));
  await db.insert(attemptLockEvents).values({ attemptId, action: "unlocked" });

  void publishRealtimeEvent({
    type: "attempt_unlocked",
    quizId: attempt.quizId,
    attemptId: attempt.id,
    studentId: attempt.studentId,
    studentName: await getStudentName(attempt.studentId),
    occurredAt: new Date().toISOString(),
  });
}

export interface AttemptSummary {
  id: string;
  studentId: string;
  studentName: string;
  status: AttemptStatus;
  attemptNumber: number;
  startedAt: Date;
  submittedAt: Date | null;
  score: number | null;
  maxScore: number | null;
  passed: boolean | null;
  violationCount: number;
  locked: boolean;
}

async function requireQuizExists(quizId: string): Promise<void> {
  const [quiz] = await db
    .select({ id: quizzes.id })
    .from(quizzes)
    .where(eq(quizzes.id, quizId))
    .limit(1);
  if (!quiz) throw notFound("Quiz not found");
}

export async function listAttemptsForQuiz(
  quizId: string,
): Promise<AttemptSummary[]> {
  await requireQuizExists(quizId);

  return db
    .select({
      id: examAttempts.id,
      studentId: examAttempts.studentId,
      studentName: users.name,
      status: examAttempts.status,
      attemptNumber: examAttempts.attemptNumber,
      startedAt: examAttempts.startedAt,
      submittedAt: examAttempts.submittedAt,
      score: examAttempts.score,
      maxScore: examAttempts.maxScore,
      passed: examAttempts.passed,
      locked: examAttempts.locked,
      violationCount: sql<number>`count(${examViolations.id})`.mapWith(Number),
    })
    .from(examAttempts)
    .innerJoin(users, eq(users.id, examAttempts.studentId))
    .leftJoin(examViolations, eq(examViolations.attemptId, examAttempts.id))
    .where(eq(examAttempts.quizId, quizId))
    .groupBy(examAttempts.id, users.name)
    .orderBy(desc(examAttempts.startedAt));
}

export interface ActivityHistoryEvent {
  type:
    | "attempt_started"
    | "attempt_submitted"
    | "violation"
    | "attempt_locked"
    | "attempt_unlocked";
  attemptId: string;
  studentId: string;
  studentName: string;
  occurredAt: Date;
  status?: "submitted" | "auto_submitted";
  score?: number | null;
  maxScore?: number | null;
  passed?: boolean | null;
  violationType?: ViolationType;
}

const MAX_ACTIVITY_HISTORY = 200;

/** Reconstructs everything that happened during this quiz's exam period from durable storage —
 * not the ephemeral realtime feed, which only ever holds whatever arrived while a teacher's tab
 * was open. Attempt starts/submissions come from exam_attempts, violations from
 * exam_violations, lock/unlock transitions from attempt_lock_events (the one thing that isn't
 * otherwise recoverable, since `exam_attempts.locked`/`locked_at` only track current state).
 * Backs the "Live activity" panel's initial history, which needs to survive a page refresh and
 * stay inspectable long after the exam period has ended — capped and newest-first, same
 * reasoning as any activity feed. */
export async function getActivityHistory(
  quizId: string,
): Promise<ActivityHistoryEvent[]> {
  await requireQuizExists(quizId);

  const attemptRows = await db
    .select({
      id: examAttempts.id,
      studentId: examAttempts.studentId,
      studentName: users.name,
      status: examAttempts.status,
      startedAt: examAttempts.startedAt,
      submittedAt: examAttempts.submittedAt,
      score: examAttempts.score,
      maxScore: examAttempts.maxScore,
      passed: examAttempts.passed,
    })
    .from(examAttempts)
    .innerJoin(users, eq(users.id, examAttempts.studentId))
    .where(eq(examAttempts.quizId, quizId));

  const violationRows = await db
    .select({
      attemptId: examViolations.attemptId,
      studentId: examAttempts.studentId,
      studentName: users.name,
      type: examViolations.type,
      occurredAt: examViolations.occurredAt,
    })
    .from(examViolations)
    .innerJoin(examAttempts, eq(examAttempts.id, examViolations.attemptId))
    .innerJoin(users, eq(users.id, examAttempts.studentId))
    .where(eq(examAttempts.quizId, quizId));

  const lockRows = await db
    .select({
      attemptId: attemptLockEvents.attemptId,
      studentId: examAttempts.studentId,
      studentName: users.name,
      action: attemptLockEvents.action,
      occurredAt: attemptLockEvents.occurredAt,
    })
    .from(attemptLockEvents)
    .innerJoin(examAttempts, eq(examAttempts.id, attemptLockEvents.attemptId))
    .innerJoin(users, eq(users.id, examAttempts.studentId))
    .where(eq(examAttempts.quizId, quizId));

  const events: ActivityHistoryEvent[] = [];

  for (const row of attemptRows) {
    events.push({
      type: "attempt_started",
      attemptId: row.id,
      studentId: row.studentId,
      studentName: row.studentName,
      occurredAt: row.startedAt,
    });
    if (row.submittedAt) {
      events.push({
        type: "attempt_submitted",
        attemptId: row.id,
        studentId: row.studentId,
        studentName: row.studentName,
        occurredAt: row.submittedAt,
        status:
          row.status === "auto_submitted" ? "auto_submitted" : "submitted",
        score: row.score,
        maxScore: row.maxScore,
        passed: row.passed,
      });
    }
  }

  for (const row of violationRows) {
    events.push({
      type: "violation",
      attemptId: row.attemptId,
      studentId: row.studentId,
      studentName: row.studentName,
      occurredAt: row.occurredAt,
      violationType: row.type,
    });
  }

  for (const row of lockRows) {
    events.push({
      type: row.action === "locked" ? "attempt_locked" : "attempt_unlocked",
      attemptId: row.attemptId,
      studentId: row.studentId,
      studentName: row.studentName,
      occurredAt: row.occurredAt,
    });
  }

  return events
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, MAX_ACTIVITY_HISTORY);
}

export interface AttemptDetailQuestion {
  questionId: string;
  type: string;
  text: string;
  points: number;
  pointsAwarded: number | null;
  options: { id: string; text: string; isCorrect: boolean }[];
  answer: {
    selectedOptionIds: string[] | null;
    textAnswer: string | null;
  } | null;
}

export interface AttemptViolationEntry {
  id: string;
  type: ViolationType;
  occurredAt: Date;
}

export interface AttemptDetail extends AttemptSummary {
  questions: AttemptDetailQuestion[];
  violations: AttemptViolationEntry[];
}

/** Full review of one student's attempt for the teacher who owns the quiz — always shows
 * correctness regardless of `quizzes.show_results`, since that setting only governs what the
 * student themselves sees (Section 10), not the teacher reviewing their own quiz. */
export async function getAttemptDetailForTeacher(
  quizId: string,
  attemptId: string,
): Promise<AttemptDetail> {
  const [attemptSummary] = await db
    .select({
      id: examAttempts.id,
      studentId: examAttempts.studentId,
      studentName: users.name,
      status: examAttempts.status,
      attemptNumber: examAttempts.attemptNumber,
      startedAt: examAttempts.startedAt,
      submittedAt: examAttempts.submittedAt,
      score: examAttempts.score,
      maxScore: examAttempts.maxScore,
      passed: examAttempts.passed,
      locked: examAttempts.locked,
    })
    .from(examAttempts)
    .innerJoin(users, eq(users.id, examAttempts.studentId))
    .where(and(eq(examAttempts.id, attemptId), eq(examAttempts.quizId, quizId)))
    .limit(1);
  if (!attemptSummary) throw notFound("Attempt not found");

  const snapshot = await db
    .select({
      questionId: examAttemptQuestions.questionId,
      position: examAttemptQuestions.position,
      optionOrder: examAttemptQuestions.optionOrder,
      type: questions.type,
      text: questions.text,
      points: questions.points,
    })
    .from(examAttemptQuestions)
    .innerJoin(questions, eq(questions.id, examAttemptQuestions.questionId))
    .where(eq(examAttemptQuestions.attemptId, attemptId))
    .orderBy(examAttemptQuestions.position);

  const questionIds = snapshot.map((row) => row.questionId);
  const optionRows =
    questionIds.length > 0
      ? await db
          .select()
          .from(questionOptions)
          .where(inArray(questionOptions.questionId, questionIds))
      : [];
  const optionsByQuestion = new Map<string, (typeof optionRows)[number][]>();
  for (const option of optionRows) {
    const list = optionsByQuestion.get(option.questionId) ?? [];
    list.push(option);
    optionsByQuestion.set(option.questionId, list);
  }

  const answerRows = await db
    .select()
    .from(examAnswers)
    .where(eq(examAnswers.attemptId, attemptId));
  const answerByQuestion = new Map(answerRows.map((a) => [a.questionId, a]));

  const violationRows = await db
    .select({
      id: examViolations.id,
      type: examViolations.type,
      occurredAt: examViolations.occurredAt,
    })
    .from(examViolations)
    .where(eq(examViolations.attemptId, attemptId))
    .orderBy(examViolations.occurredAt);

  const questionViews: AttemptDetailQuestion[] = snapshot.map((row) => {
    const optionsById = new Map(
      (optionsByQuestion.get(row.questionId) ?? []).map((o) => [o.id, o]),
    );
    const orderedOptions = row.optionOrder
      .map((id) => optionsById.get(id))
      .filter((o): o is NonNullable<typeof o> => o !== undefined);
    const answer = answerByQuestion.get(row.questionId);

    return {
      questionId: row.questionId,
      type: row.type,
      text: row.text,
      points: row.points,
      pointsAwarded: answer?.pointsAwarded ?? null,
      options: orderedOptions.map((o) => ({
        id: o.id,
        text: o.text,
        isCorrect: o.isCorrect,
      })),
      answer: answer
        ? {
            selectedOptionIds: answer.selectedOptionIds,
            textAnswer: answer.textAnswer,
          }
        : null,
    };
  });

  return {
    ...attemptSummary,
    violationCount: violationRows.length,
    questions: questionViews,
    violations: violationRows,
  };
}
