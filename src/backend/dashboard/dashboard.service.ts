import "server-only";

import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  classStudents,
  classes,
  examAttempts,
  examViolations,
  quizAssignments,
  quizzes,
  users,
} from "@/database/schema";

// Same heuristic src/features/monitoring/live-monitor.tsx uses for the "Flagged" bucket — 3+
// violations is worth a teacher's attention, 1-2 isn't broken out here since this is a
// portfolio-wide overview, not a per-quiz triage view.
const FLAGGED_VIOLATION_THRESHOLD = 3;
// How many weekly buckets the performance trend shows at most — older data still exists, just
// not plotted; this is an "recent trend" chart, not a full history view.
const MAX_TREND_WEEKS = 8;

export interface WeeklyPerformancePoint {
  weekStart: Date;
  averageScorePercent: number;
}

export interface RecentSubmission {
  attemptId: string;
  studentName: string;
  quizTitle: string;
  scorePercent: number | null;
  timeSpentSeconds: number | null;
  violationCount: number;
  flagged: boolean;
  submittedAt: Date;
}

export interface TeacherDashboard {
  totalQuizzes: number;
  totalStudents: number;
  completedAttempts: number;
  inProgressAttempts: number;
  flaggedAttempts: number;
  averageScorePercent: number | null;
  passedCount: number;
  failedCount: number;
  performanceOverTime: WeeklyPerformancePoint[];
  recentSubmissions: RecentSubmission[];
}

function weekStart(date: Date): Date {
  // Monday-start week, truncated to the day — matches how "Week 1, Week 2, ..." labels read
  // in a school context better than a Sunday-start week would.
  const day = date.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  start.setUTCDate(start.getUTCDate() - diffToMonday);
  return start;
}

/** One teacher's whole-portfolio overview — every quiz they own, not one quiz at a time like
 * results.service.ts. Deliberately still reads live off exam_attempts/exam_violations rather
 * than a cached rollup table, same reasoning as getQuizResults: the source rows already are
 * the answer, and this data volume (one teacher's attempts) doesn't need pre-aggregation. */
export async function getTeacherDashboard(
  teacherId: string,
): Promise<TeacherDashboard> {
  const myQuizzes = await db
    .select({ id: quizzes.id })
    .from(quizzes)
    .where(and(eq(quizzes.createdBy, teacherId), isNull(quizzes.deletedAt)));
  const quizIds = myQuizzes.map((q) => q.id);

  if (quizIds.length === 0) {
    return {
      totalQuizzes: 0,
      totalStudents: 0,
      completedAttempts: 0,
      inProgressAttempts: 0,
      flaggedAttempts: 0,
      averageScorePercent: null,
      passedCount: 0,
      failedCount: 0,
      performanceOverTime: [],
      recentSubmissions: [],
    };
  }

  const myClasses = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.teacherId, teacherId), isNull(classes.deletedAt)));
  const classIds = myClasses.map((c) => c.id);

  const [classStudentRows, individualAssignmentRows] = await Promise.all([
    classIds.length > 0
      ? db
          .select({ studentId: classStudents.studentId })
          .from(classStudents)
          .where(inArray(classStudents.classId, classIds))
      : Promise.resolve([]),
    db
      .select({ studentId: quizAssignments.studentId })
      .from(quizAssignments)
      .where(
        and(
          inArray(quizAssignments.quizId, quizIds),
          isNotNull(quizAssignments.studentId),
        ),
      ),
  ]);
  const totalStudents = new Set([
    ...classStudentRows.map((r) => r.studentId),
    ...individualAssignmentRows.map((r) => r.studentId as string),
  ]).size;

  const attempts = await db
    .select({
      id: examAttempts.id,
      quizTitle: quizzes.title,
      studentName: users.name,
      status: examAttempts.status,
      startedAt: examAttempts.startedAt,
      submittedAt: examAttempts.submittedAt,
      score: examAttempts.score,
      maxScore: examAttempts.maxScore,
      passed: examAttempts.passed,
      violationCount: sql<number>`count(${examViolations.id})`.mapWith(Number),
    })
    .from(examAttempts)
    .innerJoin(quizzes, eq(quizzes.id, examAttempts.quizId))
    .innerJoin(users, eq(users.id, examAttempts.studentId))
    .leftJoin(examViolations, eq(examViolations.attemptId, examAttempts.id))
    .where(inArray(examAttempts.quizId, quizIds))
    .groupBy(examAttempts.id, quizzes.title, users.name)
    .orderBy(desc(examAttempts.startedAt));

  const finished = attempts.filter((a) => a.status !== "in_progress");
  const scored = finished.filter(
    (a) => a.score !== null && a.maxScore !== null && a.maxScore > 0,
  );
  const scoredPercentages = scored.map((a) => ({
    percent: ((a.score as number) / (a.maxScore as number)) * 100,
    submittedAt: a.submittedAt as Date,
  }));

  const averageScorePercent =
    scoredPercentages.length > 0
      ? scoredPercentages.reduce((sum, p) => sum + p.percent, 0) /
        scoredPercentages.length
      : null;

  const weekBuckets = new Map<number, number[]>();
  for (const { percent, submittedAt } of scoredPercentages) {
    const key = weekStart(submittedAt).getTime();
    const bucket = weekBuckets.get(key) ?? [];
    bucket.push(percent);
    weekBuckets.set(key, bucket);
  }
  const performanceOverTime = [...weekBuckets.entries()]
    .sort(([a], [b]) => a - b)
    .slice(-MAX_TREND_WEEKS)
    .map(([time, percents]) => ({
      weekStart: new Date(time),
      averageScorePercent:
        percents.reduce((sum, p) => sum + p, 0) / percents.length,
    }));

  const recentSubmissions: RecentSubmission[] = finished
    .slice(0, 10)
    .map((a) => ({
      attemptId: a.id,
      studentName: a.studentName,
      quizTitle: a.quizTitle,
      scorePercent:
        a.score !== null && a.maxScore !== null && a.maxScore > 0
          ? (a.score / a.maxScore) * 100
          : null,
      timeSpentSeconds:
        a.submittedAt !== null
          ? Math.round((a.submittedAt.getTime() - a.startedAt.getTime()) / 1000)
          : null,
      violationCount: a.violationCount,
      flagged: a.violationCount >= FLAGGED_VIOLATION_THRESHOLD,
      submittedAt: a.submittedAt as Date,
    }));

  return {
    totalQuizzes: quizIds.length,
    totalStudents,
    completedAttempts: finished.length,
    inProgressAttempts: attempts.length - finished.length,
    flaggedAttempts: finished.filter(
      (a) => a.violationCount >= FLAGGED_VIOLATION_THRESHOLD,
    ).length,
    averageScorePercent,
    passedCount: finished.filter((a) => a.passed === true).length,
    failedCount: finished.filter((a) => a.passed === false).length,
    performanceOverTime,
    recentSubmissions,
  };
}
