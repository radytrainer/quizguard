/**
 * Shared constants between seed.ts and exam-flow.ts. Kept in its own side-effect-free module —
 * seed.ts runs its `main()` at the top level on import, so exam-flow.ts must not import
 * seed.ts directly or it would reseed on every run.
 */
export const LOAD_TEST_STUDENT_COUNT = 150;
export const LOAD_TEST_QUESTION_COUNT = 10;
export const LOAD_TEST_HISTORICAL_ATTEMPTS = 800;
export const LOAD_TEST_PASSWORD = "LoadTest1!";
export const LOAD_TEST_TEACHER_EMAIL = "loadtest-teacher@quizguard.test";
export const LOAD_TEST_CLASS_NAME = "Load Test Class";
export const LOAD_TEST_QUIZ_TITLE = "Load Test Quiz";
export const LOAD_TEST_SUBJECT = "Load Test Subject";

export function studentEmail(index: number): string {
  return `loadtest-student-${index}@quizguard.test`;
}
