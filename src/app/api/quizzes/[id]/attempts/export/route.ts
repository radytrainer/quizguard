import Papa from "papaparse";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { listAttemptsForQuiz } from "@/backend/monitoring/monitoring.service";
import { getQuiz } from "@/backend/quizzes/quiz.service";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/quizzes/[id]/attempts/export">,
) {
  try {
    await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
    const [quiz, attempts] = await Promise.all([
      getQuiz(id),
      listAttemptsForQuiz(id),
    ]);

    const csv = Papa.unparse(
      attempts.map((attempt) => ({
        student: attempt.studentName,
        email: attempt.studentEmail,
        attempt_number: attempt.attemptNumber,
        status: attempt.status,
        locked: attempt.locked,
        score: attempt.score ?? "",
        max_score: attempt.maxScore ?? "",
        passed: attempt.passed === null ? "" : attempt.passed,
        flagged_activity: attempt.violationCount,
        started_at: attempt.startedAt.toISOString(),
        submitted_at: attempt.submittedAt?.toISOString() ?? "",
      })),
    );

    const filename = `${quiz.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-attempts.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
