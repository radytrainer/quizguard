import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { badRequest, notFound } from "@/lib/api-response";
import { db } from "@/lib/db";
import {
  examAnswers,
  examAttemptQuestions,
  questionOptions,
  questions,
  type ExamAttempt,
} from "@/database/schema";
import type { SaveAnswerInput } from "@/backend/answers/answer.schema";

const CHOICE_TYPES = new Set([
  "multiple_choice",
  "true_false",
  "multiple_answer",
]);

/**
 * Persists one answer for an attempt already confirmed owned, in-progress, and not expired by
 * the caller (`attempt.service.ts#requireActiveAttemptForAnswering`) — this function only
 * handles the save itself, not those preconditions, to keep attempt.service.ts and
 * answer.service.ts from importing each other (attempt.service.ts imports `gradeAttempt` from
 * here for submission, so the dependency only runs one way).
 */
export async function saveAnswer(
  attempt: ExamAttempt,
  input: SaveAnswerInput,
): Promise<void> {
  const [snapshot] = await db
    .select({ questionId: examAttemptQuestions.questionId })
    .from(examAttemptQuestions)
    .where(
      and(
        eq(examAttemptQuestions.attemptId, attempt.id),
        eq(examAttemptQuestions.questionId, input.questionId),
      ),
    )
    .limit(1);
  if (!snapshot) throw notFound("Question is not part of this attempt");

  const [question] = await db
    .select({ type: questions.type })
    .from(questions)
    .where(eq(questions.id, input.questionId))
    .limit(1);

  const isChoice = CHOICE_TYPES.has(question.type);
  if (isChoice !== "selectedOptionIds" in input) {
    throw badRequest(
      isChoice
        ? "This question expects selectedOptionIds"
        : "This question expects a textAnswer",
    );
  }

  await db
    .insert(examAnswers)
    .values({
      attemptId: attempt.id,
      questionId: input.questionId,
      selectedOptionIds:
        "selectedOptionIds" in input ? input.selectedOptionIds : null,
      textAnswer: "textAnswer" in input ? input.textAnswer : null,
      answeredAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [examAnswers.attemptId, examAnswers.questionId],
      set: {
        selectedOptionIds:
          "selectedOptionIds" in input ? input.selectedOptionIds : null,
        textAnswer: "textAnswer" in input ? input.textAnswer : null,
        answeredAt: new Date(),
      },
    });
}

export interface GradeResult {
  score: number;
  maxScore: number;
}

/**
 * Grades every question in the attempt's snapshot against `question_options.is_correct`
 * (Section 6) and writes the result back onto `exam_answers` — including a zero-point row for
 * any question the student never answered, so the review view (Section 9-style
 * answer-stripped-until-graded pattern) has one row per snapshot question, not just answered
 * ones. Called exactly once per attempt, from `attempt.service.ts#finalizeAttempt`.
 */
export async function gradeAttempt(attemptId: string): Promise<GradeResult> {
  const snapshot = await db
    .select({
      questionId: examAttemptQuestions.questionId,
      points: questions.points,
      type: questions.type,
    })
    .from(examAttemptQuestions)
    .innerJoin(questions, eq(questions.id, examAttemptQuestions.questionId))
    .where(eq(examAttemptQuestions.attemptId, attemptId));

  const questionIds = snapshot.map((row) => row.questionId);
  const options =
    questionIds.length > 0
      ? await db
          .select()
          .from(questionOptions)
          .where(inArray(questionOptions.questionId, questionIds))
      : [];
  const answers = await db
    .select()
    .from(examAnswers)
    .where(eq(examAnswers.attemptId, attemptId));
  const answerByQuestion = new Map(answers.map((a) => [a.questionId, a]));

  let score = 0;
  let maxScore = 0;

  for (const row of snapshot) {
    maxScore += row.points;
    const answer = answerByQuestion.get(row.questionId);

    let isCorrect = false;
    if (answer) {
      if (row.type === "short_answer" || row.type === "fill_in_blank") {
        const accepted = options
          .filter((o) => o.questionId === row.questionId)
          .map((o) => o.text.trim().toLowerCase());
        isCorrect = Boolean(
          answer.textAnswer &&
          accepted.includes(answer.textAnswer.trim().toLowerCase()),
        );
      } else {
        const correctIds = new Set(
          options
            .filter((o) => o.questionId === row.questionId && o.isCorrect)
            .map((o) => o.id),
        );
        const selected = new Set(answer.selectedOptionIds ?? []);
        isCorrect =
          selected.size === correctIds.size &&
          [...selected].every((id) => correctIds.has(id));
      }
    }

    const pointsAwarded = isCorrect ? row.points : 0;
    score += pointsAwarded;

    await db
      .insert(examAnswers)
      .values({
        attemptId,
        questionId: row.questionId,
        selectedOptionIds: answer?.selectedOptionIds ?? null,
        textAnswer: answer?.textAnswer ?? null,
        isCorrect,
        pointsAwarded,
        answeredAt: answer?.answeredAt ?? new Date(),
      })
      .onConflictDoUpdate({
        target: [examAnswers.attemptId, examAnswers.questionId],
        set: { isCorrect, pointsAwarded },
      });
  }

  return { score, maxScore };
}
