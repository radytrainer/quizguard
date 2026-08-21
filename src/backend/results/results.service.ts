import "server-only";

import { and, eq, inArray, ne } from "drizzle-orm";

import { notFound } from "@/lib/api-response";
import { db } from "@/lib/db";
import {
  classStudents,
  examAnswers,
  examAttemptQuestions,
  examAttempts,
  questions,
  quizAssignments,
  quizzes,
} from "@/database/schema";

const SCORE_BUCKETS = [
  { label: "0–19%", min: 0, max: 19 },
  { label: "20–39%", min: 20, max: 39 },
  { label: "40–59%", min: 40, max: 59 },
  { label: "60–79%", min: 60, max: 79 },
  { label: "80–100%", min: 80, max: 100 },
];

export interface ScoreDistributionBucket {
  label: string;
  count: number;
}

export interface QuestionDifficultyStat {
  questionId: string;
  text: string;
  timesAsked: number;
  timesCorrect: number;
  percentCorrect: number;
}

export interface QuizResultsSummary {
  quizId: string;
  quizTitle: string;
  totalAttempts: number;
  finishedAttempts: number;
  inProgressAttempts: number;
  averageScorePercent: number | null;
  passRate: number | null;
  passedCount: number;
  failedCount: number;
  scoreDistribution: ScoreDistributionBucket[];
  questionStats: QuestionDifficultyStat[];
}

async function requireQuiz(quizId: string) {
  const [quiz] = await db
    .select({ id: quizzes.id, title: quizzes.title })
    .from(quizzes)
    .where(eq(quizzes.id, quizId))
    .limit(1);
  if (!quiz) throw notFound("Quiz not found");
  return quiz;
}

/** Aggregate results across every finished attempt of a quiz — score distribution and pass
 * rate from `exam_attempts`, per-question difficulty from `exam_attempt_questions` joined with
 * `exam_answers`. Deliberately reads live off those tables rather than a separate `quiz_results`
 * table: the attempt rows already are the results, and duplicating them would only add a sync
 * problem nothing here needs solved. */
export async function getQuizResults(
  quizId: string,
): Promise<QuizResultsSummary> {
  const quiz = await requireQuiz(quizId);

  const attempts = await db
    .select({
      status: examAttempts.status,
      score: examAttempts.score,
      maxScore: examAttempts.maxScore,
      passed: examAttempts.passed,
    })
    .from(examAttempts)
    .where(eq(examAttempts.quizId, quizId));

  const finished = attempts.filter((a) => a.status !== "in_progress");
  const scored = finished.filter(
    (a) => a.score !== null && a.maxScore !== null && a.maxScore > 0,
  );
  const percentages = scored.map(
    (a) => ((a.score as number) / (a.maxScore as number)) * 100,
  );

  const averageScorePercent =
    percentages.length > 0
      ? percentages.reduce((sum, p) => sum + p, 0) / percentages.length
      : null;

  const passedCount = finished.filter((a) => a.passed === true).length;
  const failedCount = finished.filter((a) => a.passed === false).length;
  const passRate =
    passedCount + failedCount > 0
      ? (passedCount / (passedCount + failedCount)) * 100
      : null;

  const scoreDistribution = SCORE_BUCKETS.map((bucket) => ({
    label: bucket.label,
    count: percentages.filter((p) => p >= bucket.min && p <= bucket.max).length,
  }));

  const questionRows = await db
    .select({
      questionId: examAttemptQuestions.questionId,
      text: questions.text,
      isCorrect: examAnswers.isCorrect,
    })
    .from(examAttemptQuestions)
    .innerJoin(
      examAttempts,
      eq(examAttempts.id, examAttemptQuestions.attemptId),
    )
    .innerJoin(questions, eq(questions.id, examAttemptQuestions.questionId))
    .leftJoin(
      examAnswers,
      and(
        eq(examAnswers.attemptId, examAttemptQuestions.attemptId),
        eq(examAnswers.questionId, examAttemptQuestions.questionId),
      ),
    )
    .where(
      and(
        eq(examAttempts.quizId, quizId),
        ne(examAttempts.status, "in_progress"),
      ),
    );

  const statsByQuestion = new Map<
    string,
    { text: string; timesAsked: number; timesCorrect: number }
  >();
  for (const row of questionRows) {
    const entry = statsByQuestion.get(row.questionId) ?? {
      text: row.text,
      timesAsked: 0,
      timesCorrect: 0,
    };
    entry.timesAsked += 1;
    if (row.isCorrect) entry.timesCorrect += 1;
    statsByQuestion.set(row.questionId, entry);
  }

  const questionStats: QuestionDifficultyStat[] = [...statsByQuestion.entries()]
    .map(([questionId, stat]) => ({
      questionId,
      text: stat.text,
      timesAsked: stat.timesAsked,
      timesCorrect: stat.timesCorrect,
      percentCorrect:
        stat.timesAsked > 0 ? (stat.timesCorrect / stat.timesAsked) * 100 : 0,
    }))
    .sort((a, b) => a.percentCorrect - b.percentCorrect);

  return {
    quizId: quiz.id,
    quizTitle: quiz.title,
    totalAttempts: attempts.length,
    finishedAttempts: finished.length,
    inProgressAttempts: attempts.length - finished.length,
    averageScorePercent,
    passRate,
    passedCount,
    failedCount,
    scoreDistribution,
    questionStats,
  };
}

export interface ClassQuizResult {
  quizId: string;
  quizTitle: string;
  rosterCount: number;
  attemptedCount: number;
  passedCount: number;
  passRate: number | null;
}

/** Per-quiz pass rates for one class — "class-level pass rates," distinct from a single
 * attempt's or a single quiz's global results (Section 10/11 already cover those). A student
 * counts as "passed" for a quiz if any of their finished attempts passed. Class existence
 * itself is the caller's responsibility (the API route already calls `getClass` first) — a
 * nonexistent classId behaves identically to an empty one here, both correctly returning `[]`. */
export async function getClassResults(
  classId: string,
): Promise<ClassQuizResult[]> {
  const roster = await db
    .select({ studentId: classStudents.studentId })
    .from(classStudents)
    .where(eq(classStudents.classId, classId));
  const rosterIds = roster.map((r) => r.studentId);
  if (rosterIds.length === 0) return [];

  const assignedQuizzes = await db
    .selectDistinct({ quizId: quizAssignments.quizId, title: quizzes.title })
    .from(quizAssignments)
    .innerJoin(quizzes, eq(quizzes.id, quizAssignments.quizId))
    .where(eq(quizAssignments.classId, classId));

  const results: ClassQuizResult[] = [];
  for (const quiz of assignedQuizzes) {
    const attempts = await db
      .select({
        studentId: examAttempts.studentId,
        passed: examAttempts.passed,
      })
      .from(examAttempts)
      .where(
        and(
          eq(examAttempts.quizId, quiz.quizId),
          ne(examAttempts.status, "in_progress"),
          inArray(examAttempts.studentId, rosterIds),
        ),
      );

    const attemptedStudents = new Set(attempts.map((a) => a.studentId));
    const passedStudents = new Set(
      attempts.filter((a) => a.passed).map((a) => a.studentId),
    );

    results.push({
      quizId: quiz.quizId,
      quizTitle: quiz.title,
      rosterCount: rosterIds.length,
      attemptedCount: attemptedStudents.size,
      passedCount: passedStudents.size,
      passRate:
        attemptedStudents.size > 0
          ? (passedStudents.size / attemptedStudents.size) * 100
          : null,
    });
  }

  return results;
}
