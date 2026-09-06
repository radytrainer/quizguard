// Deliberately no "use client" — purely presentational, no interactivity, so it stays usable as
// plain JSX from both the teacher's Server Component review page and exam-attempt.tsx's client
// component.
import { CheckCircle2, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

export interface TestCaseResult {
  testCaseId: string;
  passed: boolean;
  stdout: string;
  stderr: string;
}

/** Shared between the student's "Run" output (exam-attempt.tsx) and the teacher's auto-graded
 * results display (the attempt review page) — deliberately never shown a test case's own
 * input/expectedOutput (see execution.service.ts's TestCaseResult shape, which doesn't carry
 * either): a hidden test case's content must never leak through this component either. */
export function TestResultsTable({ results }: { results: TestCaseResult[] }) {
  if (results.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No test results yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {results.map((result, index) => (
        <div
          key={result.testCaseId}
          className={cn(
            "flex flex-col gap-1 rounded-lg border p-3 text-sm",
            result.passed
              ? "border-success/30 bg-success/5"
              : "border-destructive/30 bg-destructive/5",
          )}
        >
          <div className="flex items-center gap-2 font-medium">
            {result.passed ? (
              <CheckCircle2 className="text-success size-4 shrink-0" />
            ) : (
              <XCircle className="text-destructive size-4 shrink-0" />
            )}
            Test {index + 1}: {result.passed ? "Passed" : "Failed"}
          </div>
          {result.stdout && (
            <pre className="text-muted-foreground overflow-x-auto whitespace-pre-wrap">
              {result.stdout}
            </pre>
          )}
          {result.stderr && (
            <pre className="text-destructive overflow-x-auto whitespace-pre-wrap">
              {result.stderr}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
