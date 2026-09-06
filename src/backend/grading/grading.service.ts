import "server-only";

import { and, count, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { examAnswers, examAttempts, quizzes, users } from "@/database/schema";
import type { AuthUser } from "@/backend/auth/session";

export interface PendingReviewAttempt {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  studentName: string;
  pendingCount: number;
  submittedAt: Date | null;
}

/**
 * One row per attempt that has at least one exam_answers.needs_review row still unset (essay
 * always; code_answer html/css in Phase 16) — grouped, not one row per pending question, since
 * the teacher's actual workflow is "open this attempt and grade everything in it," same as the
 * existing per-quiz attempts list. Admin sees every teacher's queue, same "no ownership filter
 * for admin" convention as question.service.ts#listQuestions.
 */
export async function listAttemptsPendingReview(
  requester: AuthUser,
): Promise<PendingReviewAttempt[]> {
  const conditions = [eq(examAnswers.needsReview, true)];
  if (requester.role !== "admin") {
    conditions.push(eq(quizzes.createdBy, requester.id));
  }

  return db
    .select({
      attemptId: examAttempts.id,
      quizId: examAttempts.quizId,
      quizTitle: quizzes.title,
      studentName: users.name,
      pendingCount: count(examAnswers.questionId),
      submittedAt: examAttempts.submittedAt,
    })
    .from(examAnswers)
    .innerJoin(examAttempts, eq(examAttempts.id, examAnswers.attemptId))
    .innerJoin(quizzes, eq(quizzes.id, examAttempts.quizId))
    .innerJoin(users, eq(users.id, examAttempts.studentId))
    .where(and(...conditions))
    .groupBy(
      examAttempts.id,
      examAttempts.quizId,
      examAttempts.submittedAt,
      quizzes.title,
      users.name,
    )
    .orderBy(desc(examAttempts.submittedAt));
}
