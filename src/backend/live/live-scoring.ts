// Deliberately dependency-free (no db/redis/other backend imports) — this is the one piece of
// live.service.ts pure enough to unit test in isolation, and keeping it that way means the test
// never needs a live Postgres/Redis connection.
const MAX_POINTS_PER_QUESTION = 1000;

/**
 * Kahoot-style speed bonus: correct answers score between 50% and 100% of the per-question max
 * depending on how much of the time limit was left. Clamped so a late or clock-skewed
 * submission can never score negative or over the max. Never fed anything the client reports —
 * callers compute `elapsedMs` from the server's own `currentQuestionStartedAt`.
 */
export function computeSpeedPoints(
  elapsedMs: number,
  timeLimitMs: number,
  isCorrect: boolean,
): number {
  if (!isCorrect) return 0;
  const clampedElapsed = Math.min(Math.max(elapsedMs, 0), timeLimitMs);
  const remainingFraction = 1 - clampedElapsed / timeLimitMs;
  return Math.round(MAX_POINTS_PER_QUESTION * (0.5 + 0.5 * remainingFraction));
}
