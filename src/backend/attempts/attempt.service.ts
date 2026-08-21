import "server-only";

import { and, count, desc, eq, inArray } from "drizzle-orm";

import { gradeAttempt } from "@/backend/answers/answer.service";
import { listAssignmentsForStudent } from "@/backend/assignments/assignment.service";
import {
  getStudentName,
  publishRealtimeEvent,
} from "@/backend/realtime/realtime.service";
import { conflict, forbidden, notFound } from "@/lib/api-response";
import { db } from "@/lib/db";
import {
  examAnswers,
  examAttemptQuestions,
  examAttempts,
  questionOptions,
  questions,
  quizQuestions,
  quizzes,
  type AttemptStatus,
  type ExamAttempt,
  type Quiz,
} from "@/database/schema";

export interface AttemptQuestionOption {
  id: string;
  text: string;
  isCorrect?: boolean;
}

export interface AttemptQuestionView {
  questionId: string;
  type: string;
  text: string;
  points: number;
  options: AttemptQuestionOption[];
  answer: {
    selectedOptionIds: string[] | null;
    textAnswer: string | null;
  } | null;
}

export interface AttemptView {
  id: string;
  quizId: string;
  quizTitle: string;
  status: AttemptStatus;
  startedAt: Date;
  deadlineAt: Date;
  submittedAt: Date | null;
  score: number | null;
  maxScore: number | null;
  passed: boolean | null;
  reviewAvailable: boolean;
  fullscreenRequired: boolean;
  monitorActivity: boolean;
  locked: boolean;
  questions: AttemptQuestionView[];
}

export interface AttemptHistoryItem {
  id: string;
  quizId: string;
  quizTitle: string;
  status: AttemptStatus;
  attemptNumber: number;
  startedAt: Date;
  submittedAt: Date | null;
  score: number | null;
  maxScore: number | null;
  passed: boolean | null;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function requireQuiz(quizId: string): Promise<Quiz> {
  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, quizId))
    .limit(1);
  if (!quiz) throw notFound("Quiz not found");
  return quiz;
}

async function requireOwnedAttempt(
  attemptId: string,
  studentId: string,
): Promise<ExamAttempt> {
  const [attempt] = await db
    .select()
    .from(examAttempts)
    .where(
      and(
        eq(examAttempts.id, attemptId),
        eq(examAttempts.studentId, studentId),
      ),
    )
    .limit(1);
  if (!attempt) throw notFound("Attempt not found");
  return attempt;
}

/** Grades and closes an in-progress attempt whose deadline has passed — the server clock is the
 * only authority on expiry (Rule: never trust client-side score or timer); this runs lazily,
 * whenever the attempt is next touched, rather than via a background job. */
async function finalizeAttempt(
  attempt: ExamAttempt,
  status: Extract<AttemptStatus, "submitted" | "auto_submitted">,
): Promise<ExamAttempt> {
  const { score, maxScore } = await gradeAttempt(attempt.id);
  const quiz = await requireQuiz(attempt.quizId);
  const passed = maxScore > 0 && (score / maxScore) * 100 >= quiz.passingScore;

  const [updated] = await db
    .update(examAttempts)
    .set({ status, submittedAt: new Date(), score, maxScore, passed })
    .where(eq(examAttempts.id, attempt.id))
    .returning();

  void publishRealtimeEvent({
    type: "attempt_submitted",
    quizId: updated.quizId,
    attemptId: updated.id,
    studentId: updated.studentId,
    studentName: await getStudentName(updated.studentId),
    status,
    score,
    maxScore,
    passed,
    occurredAt: new Date().toISOString(),
  });

  return updated;
}

async function maybeExpire(attempt: ExamAttempt): Promise<ExamAttempt> {
  if (attempt.status !== "in_progress") return attempt;
  if (new Date() <= attempt.deadlineAt) return attempt;
  return finalizeAttempt(attempt, "auto_submitted");
}

/** Confirms an attempt is owned by this student, still in progress, not past its deadline, and
 * not locked — used before any mutation (saving an answer, submitting, reporting a violation).
 * An expired attempt is graded and closed here rather than left dangling, then rejected with
 * 409 since it can no longer accept changes. A locked attempt (Section 10 — the student exited
 * fullscreen on a quiz that requires it) is rejected the same way; only a teacher unlocking it
 * (monitoring.service.ts's `unlockAttempt`) clears that state — there is deliberately no
 * self-service path here. */
export async function requireActiveAttemptForAnswering(
  attemptId: string,
  studentId: string,
): Promise<ExamAttempt> {
  const attempt = await maybeExpire(
    await requireOwnedAttempt(attemptId, studentId),
  );
  if (attempt.status !== "in_progress") {
    throw conflict("This attempt has already ended");
  }
  if (attempt.locked) {
    throw conflict(
      "This attempt is locked — ask your teacher to unlock it to continue",
    );
  }
  return attempt;
}

async function countAttempts(
  quizId: string,
  studentId: string,
): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(examAttempts)
    .where(
      and(
        eq(examAttempts.quizId, quizId),
        eq(examAttempts.studentId, studentId),
      ),
    );
  return value;
}

export async function startAttempt(
  quizId: string,
  studentId: string,
): Promise<ExamAttempt> {
  const quiz = await requireQuiz(quizId);

  // Resuming an attempt already in flight takes priority over every other check below — if the
  // quiz was unpublished or its assignment window closed after the student started, that
  // shouldn't strand them mid-attempt. Those checks only gate *starting a new* attempt.
  const [existing] = await db
    .select()
    .from(examAttempts)
    .where(
      and(
        eq(examAttempts.quizId, quizId),
        eq(examAttempts.studentId, studentId),
        eq(examAttempts.status, "in_progress"),
      ),
    )
    .limit(1);
  if (existing) {
    const resumed = await maybeExpire(existing);
    if (resumed.status === "in_progress") return resumed;
    // Deadline just passed between page loads — fall through to check whether another attempt
    // can start, exactly as if this had been graded before the student ever came back.
  }

  if (quiz.status !== "published") {
    throw conflict("This quiz is not published");
  }

  const assignments = await listAssignmentsForStudent(studentId);
  const now = new Date();
  const candidate = assignments.find((a) => a.quizId === quizId);
  if (!candidate) throw forbidden("This quiz is not assigned to you");
  const withinWindow =
    (!candidate.startAt || candidate.startAt <= now) &&
    (!candidate.endAt || candidate.endAt >= now);
  if (!withinWindow) throw forbidden("This quiz is not currently open");

  const attemptCount = await countAttempts(quizId, studentId);
  if (attemptCount >= quiz.maxAttempts) {
    throw conflict("No attempts remaining for this quiz");
  }

  const pool = await db
    .select({
      questionId: quizQuestions.questionId,
      position: quizQuestions.position,
    })
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.position);
  if (pool.length === 0) throw conflict("This quiz has no questions");

  const questionCount = Math.min(quiz.questionsPerAttempt, pool.length);
  const selected = (quiz.randomizeQuestions ? shuffle(pool) : pool).slice(
    0,
    questionCount,
  );
  const selectedIds = selected.map((row) => row.questionId);

  const optionRows = await db
    .select({ id: questionOptions.id, questionId: questionOptions.questionId })
    .from(questionOptions)
    .where(inArray(questionOptions.questionId, selectedIds))
    .orderBy(questionOptions.position);
  const optionsByQuestion = new Map<string, string[]>();
  for (const option of optionRows) {
    const ids = optionsByQuestion.get(option.questionId) ?? [];
    ids.push(option.id);
    optionsByQuestion.set(option.questionId, ids);
  }

  const startedAt = now;
  const deadlineAt = new Date(
    startedAt.getTime() + quiz.durationMinutes * 60_000,
  );

  const attempt = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(examAttempts)
      .values({
        quizId,
        studentId,
        assignmentId: candidate.id,
        attemptNumber: attemptCount + 1,
        status: "in_progress",
        startedAt,
        deadlineAt,
      })
      .returning();

    await tx.insert(examAttemptQuestions).values(
      selected.map((row, index) => {
        const optionIds = optionsByQuestion.get(row.questionId) ?? [];
        return {
          attemptId: inserted.id,
          questionId: row.questionId,
          position: index,
          optionOrder: quiz.randomizeOptions ? shuffle(optionIds) : optionIds,
        };
      }),
    );

    return inserted;
  });

  void publishRealtimeEvent({
    type: "attempt_started",
    quizId: attempt.quizId,
    attemptId: attempt.id,
    studentId: attempt.studentId,
    studentName: await getStudentName(attempt.studentId),
    occurredAt: new Date().toISOString(),
  });

  return attempt;
}

/** Deliberately read-only, unlike `requireActiveAttemptForAnswering` below — a `GET` must
 * never have a side effect (Rule: HTTP GET is safe/idempotent; also the concrete reason this
 * matters here: `SameSite=Lax` doesn't protect `GET` from cross-site triggering the way it does
 * `POST`/`PUT`, so a mutation reachable via `GET` would be a real CSRF hole). A `GET` on an
 * expired-but-still-`in_progress` attempt returns it exactly as stored — `deadlineAt` already
 * tells the client it's over, and the client's own countdown (`exam-attempt.tsx`) fires the
 * actual `POST /submit` within a second of noticing. If nothing ever calls a mutating endpoint
 * again, the attempt simply stays `in_progress` until `startAttempt`'s own `maybeExpire` check
 * closes it out the next time that student tries to start a new one — never a dangling problem,
 * just a display staleness one, and only for an abandoned attempt nobody is looking at. */
export async function getAttempt(
  attemptId: string,
  studentId: string,
): Promise<AttemptView> {
  const attempt = await requireOwnedAttempt(attemptId, studentId);
  const quiz = await requireQuiz(attempt.quizId);

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

  const finished = attempt.status !== "in_progress";
  const reviewAvailable = finished && quiz.showResults;

  const questionViews: AttemptQuestionView[] = snapshot.map((row) => {
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
      options: orderedOptions.map((o) => ({
        id: o.id,
        text: o.text,
        ...(reviewAvailable ? { isCorrect: o.isCorrect } : {}),
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
    id: attempt.id,
    quizId: attempt.quizId,
    quizTitle: quiz.title,
    status: attempt.status,
    startedAt: attempt.startedAt,
    deadlineAt: attempt.deadlineAt,
    submittedAt: attempt.submittedAt,
    score: attempt.score,
    maxScore: attempt.maxScore,
    passed: attempt.passed,
    reviewAvailable,
    fullscreenRequired: quiz.fullscreenRequired,
    monitorActivity: quiz.monitorActivity,
    locked: attempt.locked,
    questions: questionViews,
  };
}

/** A locked attempt can't even be self-submitted (Section 10) — the student has no way to end
 * it themselves until a teacher unlocks it. If the deadline passes while locked, `maybeExpire`
 * still closes it out lazily the next time anyone reads it (a teacher viewing the attempt, or
 * the student reopening the page after being unlocked) — same "stale, never dangling" reasoning
 * as an ordinary abandoned attempt (see `getAttempt` above). */
export async function submitAttempt(
  attemptId: string,
  studentId: string,
): Promise<ExamAttempt> {
  const attempt = await requireOwnedAttempt(attemptId, studentId);
  if (attempt.status !== "in_progress") return attempt;
  if (attempt.locked) {
    throw conflict(
      "This attempt is locked — ask your teacher to unlock it to continue",
    );
  }

  const status =
    new Date() > attempt.deadlineAt ? "auto_submitted" : "submitted";
  return finalizeAttempt(attempt, status);
}

export async function listAttemptHistory(
  studentId: string,
): Promise<AttemptHistoryItem[]> {
  return db
    .select({
      id: examAttempts.id,
      quizId: examAttempts.quizId,
      quizTitle: quizzes.title,
      status: examAttempts.status,
      attemptNumber: examAttempts.attemptNumber,
      startedAt: examAttempts.startedAt,
      submittedAt: examAttempts.submittedAt,
      score: examAttempts.score,
      maxScore: examAttempts.maxScore,
      passed: examAttempts.passed,
    })
    .from(examAttempts)
    .innerJoin(quizzes, eq(quizzes.id, examAttempts.quizId))
    .where(eq(examAttempts.studentId, studentId))
    .orderBy(desc(examAttempts.startedAt));
}
