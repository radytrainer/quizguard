import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { badRequest, notFound } from "@/lib/api-response";
import { db } from "@/lib/db";
import {
  examAnswers,
  examAttemptQuestions,
  examAttempts,
  questionOptions,
  questionTestCases,
  questions,
  quizzes,
  type ExamAttempt,
} from "@/database/schema";
import type {
  GradeAnswerInput,
  SaveAnswerInput,
} from "@/backend/answers/answer.schema";
import {
  getStudentName,
  publishRealtimeEvent,
} from "@/backend/realtime/realtime.service";
import { QUESTION_TYPES } from "@/backend/questions/question-types";
import {
  computeCodeAnswerScore,
  computeNumericCorrectness,
} from "@/backend/answers/answer-scoring";
import {
  gradeCodeAnswer,
  runSampleTestCases,
  type TestCaseResult,
} from "@/backend/execution/execution.service";

export { computeNumericCorrectness };

/** Shared by `saveAnswer` and `runCodeForAttempt` — a question id a client sends must actually
 * be part of this specific attempt's snapshot, never just any question in the bank. */
async function assertQuestionInSnapshot(
  attemptId: string,
  questionId: string,
): Promise<void> {
  const [snapshot] = await db
    .select({ questionId: examAttemptQuestions.questionId })
    .from(examAttemptQuestions)
    .where(
      and(
        eq(examAttemptQuestions.attemptId, attemptId),
        eq(examAttemptQuestions.questionId, questionId),
      ),
    )
    .limit(1);
  if (!snapshot) throw notFound("Question is not part of this attempt");
}

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
  await assertQuestionInSnapshot(attempt.id, input.questionId);

  const [question] = await db
    .select({ type: questions.type })
    .from(questions)
    .where(eq(questions.id, input.questionId))
    .limit(1);

  const isChoice = QUESTION_TYPES[question.type].isChoice;
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

export interface RunCodeResult {
  ok: boolean;
  results: TestCaseResult[];
  error?: string;
}

/**
 * The student's own "Run" button (never scores anything — see execution.service.ts). html/css
 * has nothing to execute at all (the client renders its own sandboxed preview); python/javascript
 * runs only against `is_sample = true` test cases — a hidden one's input/expectedOutput must
 * never reach the client, which is exactly why this queries them separately rather than reusing
 * whatever gradeAttempt later fetches for the full (sample + hidden) set.
 */
export async function runCodeForAttempt(
  attempt: ExamAttempt,
  questionId: string,
  code: string,
): Promise<RunCodeResult> {
  await assertQuestionInSnapshot(attempt.id, questionId);

  const [question] = await db
    .select({ type: questions.type, codeLanguage: questions.codeLanguage })
    .from(questions)
    .where(eq(questions.id, questionId))
    .limit(1);
  if (!question || question.type !== "code_answer" || !question.codeLanguage) {
    throw badRequest("This question is not a code question");
  }

  if (question.codeLanguage === "html" || question.codeLanguage === "css") {
    return { ok: true, results: [] };
  }

  const sampleCases = await db
    .select({
      id: questionTestCases.id,
      input: questionTestCases.input,
      expectedOutput: questionTestCases.expectedOutput,
    })
    .from(questionTestCases)
    .where(
      and(
        eq(questionTestCases.questionId, questionId),
        eq(questionTestCases.isSample, true),
      ),
    )
    .orderBy(questionTestCases.position);

  return runSampleTestCases(question.codeLanguage, code, sampleCases);
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
      numericTolerance: questions.numericTolerance,
      codeLanguage: questions.codeLanguage,
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

  // Every test case (sample + hidden) for the executable code_answer questions in this attempt —
  // unlike runCodeForAttempt's own fetch, grading needs the hidden ones too.
  const codeQuestionIds = snapshot
    .filter(
      (row) =>
        row.type === "code_answer" &&
        (row.codeLanguage === "python" || row.codeLanguage === "javascript"),
    )
    .map((row) => row.questionId);
  const testCaseRows =
    codeQuestionIds.length > 0
      ? await db
          .select()
          .from(questionTestCases)
          .where(inArray(questionTestCases.questionId, codeQuestionIds))
          .orderBy(questionTestCases.position)
      : [];
  const testCasesByQuestion = new Map<string, typeof testCaseRows>();
  for (const testCase of testCaseRows) {
    const list = testCasesByQuestion.get(testCase.questionId) ?? [];
    list.push(testCase);
    testCasesByQuestion.set(testCase.questionId, list);
  }

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

    // Each branch sets its own pointsAwarded/isCorrect/needsReview (defaulting to 0/false/
    // false) rather than one shared formula at the end — necessary for code_answer's
    // proportional credit, which a single "full points or zero" line can't express.
    let needsReview = false;
    let isCorrect = false;
    let pointsAwarded = 0;
    let testResults: TestCaseResult[] | null = null;

    const isManuallyGraded =
      row.type === "essay" ||
      (row.type === "code_answer" &&
        (row.codeLanguage === "html" || row.codeLanguage === "css"));

    if (isManuallyGraded) {
      // A blank answer is unambiguously 0 points, no teacher needed — same rule for essay and
      // code_answer-html/css, neither of which ever gets executed either way.
      needsReview = Boolean(answer?.textAnswer?.trim());
    } else if (answer) {
      if (row.type === "numeric_answer") {
        const accepted = options.find((o) => o.questionId === row.questionId);
        isCorrect = accepted
          ? computeNumericCorrectness(
              answer.textAnswer,
              Number(accepted.text),
              row.numericTolerance ?? 0,
            )
          : false;
        pointsAwarded = isCorrect ? row.points : 0;
      } else if (row.type === "short_answer" || row.type === "fill_in_blank") {
        const accepted = options
          .filter((o) => o.questionId === row.questionId)
          .map((o) => o.text.trim().toLowerCase());
        isCorrect = Boolean(
          answer.textAnswer &&
          accepted.includes(answer.textAnswer.trim().toLowerCase()),
        );
        pointsAwarded = isCorrect ? row.points : 0;
      } else if (row.type === "code_answer") {
        // html/css already handled above — only python/javascript reach here.
        if (
          (row.codeLanguage === "python" || row.codeLanguage === "javascript") &&
          answer.textAnswer?.trim()
        ) {
          const cases = testCasesByQuestion.get(row.questionId) ?? [];
          const outcome = await gradeCodeAnswer(
            row.codeLanguage,
            answer.textAnswer,
            cases,
          );
          if (!outcome.ok) {
            // Piston unreachable — degrade to manual review, exactly like essay, rather than
            // failing the whole submission. The answer is already durably saved regardless.
            needsReview = true;
          } else {
            testResults = outcome.results;
            ({ pointsAwarded, isCorrect } = computeCodeAnswerScore(
              outcome.results,
              row.points,
            ));
          }
        }
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
        pointsAwarded = isCorrect ? row.points : 0;
      }
    }

    score += pointsAwarded;

    await db
      .insert(examAnswers)
      .values({
        attemptId,
        questionId: row.questionId,
        selectedOptionIds: answer?.selectedOptionIds ?? null,
        textAnswer: answer?.textAnswer ?? null,
        isCorrect: needsReview ? null : isCorrect,
        pointsAwarded,
        needsReview,
        testResults,
        answeredAt: answer?.answeredAt ?? new Date(),
      })
      .onConflictDoUpdate({
        target: [examAnswers.attemptId, examAnswers.questionId],
        set: {
          isCorrect: needsReview ? null : isCorrect,
          pointsAwarded,
          needsReview,
          testResults,
        },
      });
  }

  return { score, maxScore };
}

/**
 * Manually (re)grades one answer — the only path essay/code_answer-html/css questions ever get
 * a real score through, and also how a teacher can override an already auto-graded answer (not
 * gated on `needsReview`: nothing here requires the row currently being under review). Clamps
 * to the question's own point value, then recomputes the whole attempt's score/passed exactly
 * the way `finalizeAttempt` (attempt.service.ts) does at submit time, since a single answer
 * changing can move the total.
 */
export async function gradeAnswer(
  quizId: string,
  attemptId: string,
  questionId: string,
  input: GradeAnswerInput,
  teacherId: string,
): Promise<void> {
  // Scoped to quizId, not just attemptId — without this, a teacher who owns *some* quiz could
  // grade an answer on a different teacher's attempt just by knowing/guessing its id (same class
  // of IDOR already fixed elsewhere for attempt review).
  const [attempt] = await db
    .select()
    .from(examAttempts)
    .where(and(eq(examAttempts.id, attemptId), eq(examAttempts.quizId, quizId)))
    .limit(1);
  if (!attempt) throw notFound("Attempt not found");

  const [answer] = await db
    .select({ questionId: examAnswers.questionId })
    .from(examAnswers)
    .where(
      and(
        eq(examAnswers.attemptId, attemptId),
        eq(examAnswers.questionId, questionId),
      ),
    )
    .limit(1);
  if (!answer) throw notFound("Answer not found");

  const [question] = await db
    .select({ points: questions.points })
    .from(questions)
    .where(eq(questions.id, questionId))
    .limit(1);
  if (!question) throw notFound("Question not found");

  const pointsAwarded = Math.min(Math.max(input.pointsAwarded, 0), question.points);
  const isCorrect = pointsAwarded === question.points;

  await db
    .update(examAnswers)
    .set({
      pointsAwarded,
      isCorrect,
      needsReview: false,
      gradedBy: teacherId,
      gradedAt: new Date(),
      teacherFeedback: input.feedback ?? null,
    })
    .where(
      and(
        eq(examAnswers.attemptId, attemptId),
        eq(examAnswers.questionId, questionId),
      ),
    );

  const allAnswers = await db
    .select({ pointsAwarded: examAnswers.pointsAwarded })
    .from(examAnswers)
    .where(eq(examAnswers.attemptId, attemptId));
  const score = allAnswers.reduce((sum, a) => sum + (a.pointsAwarded ?? 0), 0);

  const [quiz] = await db
    .select({ passingScore: quizzes.passingScore })
    .from(quizzes)
    .where(eq(quizzes.id, attempt.quizId))
    .limit(1);
  if (!quiz) throw notFound("Quiz not found");

  const maxScore = attempt.maxScore ?? 0;
  const passed = maxScore > 0 && (score / maxScore) * 100 >= quiz.passingScore;

  const [updated] = await db
    .update(examAttempts)
    .set({ score, passed })
    .where(eq(examAttempts.id, attemptId))
    .returning();

  void publishRealtimeEvent({
    type: "attempt_regraded",
    quizId: updated.quizId,
    attemptId: updated.id,
    studentId: updated.studentId,
    studentName: await getStudentName(updated.studentId),
    score,
    maxScore: updated.maxScore,
    passed,
    occurredAt: new Date().toISOString(),
  });
}
