import "server-only";

import { pistonExecute } from "@/backend/execution/piston-client";
import { PISTON_RUNTIME } from "@/backend/execution/runtime-map";
import type { CodeLanguage } from "@/backend/questions/question-types";

export interface TestCaseResult {
  testCaseId: string;
  passed: boolean;
  stdout: string;
  stderr: string;
}

/**
 * `ok: false` means Piston itself didn't answer (network error, non-2xx, timeout) — callers
 * (the /run route, gradeAttempt) must treat this as "temporarily can't auto-grade," never as a
 * failed submission: they degrade to a generic error message / `needsReview = true`, mirroring
 * realtime.service.ts#publishRealtimeEvent's own "best-effort, never fail the caller's real
 * operation" discipline. `ok: true, results: []` is a distinct, non-error case meaning "nothing
 * to execute here at all" (html/css).
 */
export interface RunOutcome {
  ok: boolean;
  results: TestCaseResult[];
  error?: string;
}

// A student is watching "Run" live; grading happens once, server-side, at submit — a little
// more patience is affordable there.
const RUN_TIMEOUT_MS = 5000;
const GRADE_TIMEOUT_MS = 8000;
const MAX_OUTPUT_CHARS = 4000;

function truncate(value: string): string {
  return value.length > MAX_OUTPUT_CHARS
    ? `${value.slice(0, MAX_OUTPUT_CHARS)}\n…(truncated)`
    : value;
}

async function runOne(
  language: "python" | "javascript",
  code: string,
  testCase: { id: string; input: string; expectedOutput: string },
  timeoutMs: number,
): Promise<TestCaseResult> {
  const runtime = PISTON_RUNTIME[language];
  const result = await pistonExecute({
    language: runtime.language,
    version: runtime.version,
    code,
    stdin: testCase.input,
    runTimeoutMs: timeoutMs,
  });
  const stdout = truncate(result.run.stdout ?? "");
  const stderr = truncate(result.run.stderr ?? "");
  const passed =
    result.run.code === 0 && stdout.trim() === testCase.expectedOutput.trim();
  return { testCaseId: testCase.id, passed, stdout, stderr };
}

// Sequential, not Promise.all — bounds load on one shared Piston instance rather than letting a
// single question's many test cases (or several concurrent students) burst it all at once.
async function runAll(
  language: CodeLanguage,
  code: string,
  cases: { id: string; input: string; expectedOutput: string }[],
  timeoutMs: number,
): Promise<RunOutcome> {
  if (language !== "python" && language !== "javascript") {
    return { ok: true, results: [] };
  }
  try {
    const results: TestCaseResult[] = [];
    for (const testCase of cases) {
      results.push(await runOne(language, code, testCase, timeoutMs));
    }
    return { ok: true, results };
  } catch (err) {
    console.error("Piston execution failed:", err);
    return {
      ok: false,
      results: [],
      error: "Code execution is temporarily unavailable.",
    };
  }
}

/** Student's own "Run" — only ever called with `isSample=true` test cases (see the /run route
 * and answer.service.ts#runCodeForAttempt); never scores anything. */
export function runSampleTestCases(
  language: CodeLanguage,
  code: string,
  cases: { id: string; input: string; expectedOutput: string }[],
): Promise<RunOutcome> {
  return runAll(language, code, cases, RUN_TIMEOUT_MS);
}

/** Authoritative — called only from gradeAttempt, against every test case (sample + hidden). The
 * server always re-executes the submitted code itself; a client-reported "it passed" is never
 * trusted. */
export function gradeCodeAnswer(
  language: CodeLanguage,
  code: string,
  cases: { id: string; input: string; expectedOutput: string }[],
): Promise<RunOutcome> {
  return runAll(language, code, cases, GRADE_TIMEOUT_MS);
}
