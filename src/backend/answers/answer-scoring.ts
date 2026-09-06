// Deliberately dependency-free (no db/redis/other backend imports) — same reasoning as
// backend/live/live-scoring.ts: this is the one piece of answer.service.ts's grading logic pure
// enough to unit test in isolation, and keeping it that way means the test never needs a live
// Postgres connection.

/**
 * numeric_answer grading: within `tolerance` of `accepted` counts as correct. `submittedText`
 * comes straight from exam_answers.text_answer — never trust the client to have sent a number;
 * a non-numeric or missing submission is simply wrong, not an error.
 */
export function computeNumericCorrectness(
  submittedText: string | null,
  accepted: number,
  tolerance: number,
): boolean {
  if (submittedText === null) return false;
  const submitted = Number(submittedText);
  return Number.isFinite(submitted) && Math.abs(submitted - accepted) <= tolerance;
}

/**
 * code_answer (python/javascript) grading: proportional credit by test-case pass rate, unlike
 * every other type's all-or-nothing scoring — a coding exercise where a student gets most of it
 * right shouldn't score the same as one they left blank. `isCorrect` only when every case
 * passes, so it still means "fully correct" everywhere else in the codebase that reads it.
 * Zero test results (e.g. the question has none, or Piston never ran) scores 0, never full
 * credit for an empty pass rate.
 */
export function computeCodeAnswerScore(
  testResults: { passed: boolean }[],
  totalPoints: number,
): { pointsAwarded: number; isCorrect: boolean } {
  if (testResults.length === 0) return { pointsAwarded: 0, isCorrect: false };
  const passedCount = testResults.filter((r) => r.passed).length;
  const pointsAwarded = Math.round(totalPoints * (passedCount / testResults.length));
  return { pointsAwarded, isCorrect: passedCount === testResults.length };
}
