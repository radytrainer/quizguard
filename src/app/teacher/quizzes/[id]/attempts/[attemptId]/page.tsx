import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/backend/auth/session";
import { getAttemptDetailForTeacher } from "@/backend/monitoring/monitoring.service";
import { getQuiz } from "@/backend/quizzes/quiz.service";
import { ApiError } from "@/lib/api-response";

const STATUS_LABELS: Record<string, string> = {
  in_progress: "In progress",
  submitted: "Submitted",
  auto_submitted: "Auto-submitted",
};

const VIOLATION_LABELS: Record<string, string> = {
  fullscreen_exit: "Exited fullscreen",
  tab_switch: "Switched tabs / minimized",
  copy_paste: "Copy or cut",
};

export default async function AttemptDetailPage({
  params,
}: PageProps<"/teacher/quizzes/[id]/attempts/[attemptId]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher" && user.role !== "admin") redirect("/dashboard");

  const { id, attemptId } = await params;

  try {
    await getQuiz(id, user);
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 404 || error.status === 403)
    )
      notFound();
    throw error;
  }

  let attempt;
  try {
    attempt = await getAttemptDetailForTeacher(id, attemptId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <p className="text-muted-foreground text-sm">
          <Link
            href="/teacher/quizzes"
            className="hover:text-foreground hover:underline"
          >
            Quizzes
          </Link>{" "}
          /{" "}
          <Link
            href={`/teacher/quizzes/${id}/attempts`}
            className="hover:text-foreground hover:underline"
          >
            Attempts
          </Link>{" "}
          / <span className="text-primary">Review</span>
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          {attempt.studentName}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overview</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Attempt</p>
            <p className="font-medium">{attempt.attemptNumber}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Status</p>
            <p className="font-medium">{STATUS_LABELS[attempt.status]}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Score</p>
            <p className="font-medium">
              {attempt.score === null
                ? "—"
                : `${attempt.score} / ${attempt.maxScore}`}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Result</p>
            <p className="font-medium">
              {attempt.passed === null ? (
                "—"
              ) : (
                <Badge
                  variant="outline"
                  className={
                    attempt.passed
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-destructive/30 bg-destructive/10 text-destructive"
                  }
                >
                  {attempt.passed ? "Passed" : "Not passed"}
                </Badge>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Flagged activity ({attempt.violations.length})
          </CardTitle>
          <CardDescription>
            Only signals this browser tab can honestly observe about itself —
            fullscreen exits, tab switches, and copy/cut.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {attempt.violations.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No flagged activity during this attempt.
            </p>
          )}
          {attempt.violations.map((violation) => (
            <div
              key={violation.id}
              className="border-outline-variant flex items-center justify-between rounded-lg border p-3 text-sm"
            >
              <span>{VIOLATION_LABELS[violation.type]}</span>
              <span className="text-muted-foreground">
                {violation.occurredAt.toLocaleTimeString()}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Answers ({attempt.questions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {attempt.questions.map((question, index) => {
            const correctIds = new Set(
              question.options.filter((o) => o.isCorrect).map((o) => o.id),
            );
            const selected = new Set(question.answer?.selectedOptionIds ?? []);

            return (
              <div
                key={question.questionId}
                className="border-outline-variant rounded-lg border p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm">
                    <span className="text-muted-foreground mr-2">
                      {index + 1}.
                    </span>
                    {question.text}
                  </p>
                  <Badge variant="outline" className="shrink-0">
                    {question.pointsAwarded ?? 0} / {question.points} pt
                  </Badge>
                </div>
                <div className="mt-2 flex flex-col gap-1 pl-5 text-sm">
                  {question.options.length > 0 &&
                    question.options.map((option) => (
                      <div
                        key={option.id}
                        className={
                          option.isCorrect
                            ? "text-success"
                            : selected.has(option.id)
                              ? "text-destructive"
                              : "text-muted-foreground"
                        }
                      >
                        {correctIds.has(option.id) ? "✓" : "·"} {option.text}
                        {selected.has(option.id) && " (selected)"}
                      </div>
                    ))}
                  {question.options.length === 0 && (
                    <p
                      className={
                        question.pointsAwarded
                          ? "text-success"
                          : "text-destructive"
                      }
                    >
                      {question.answer?.textAnswer || "(no answer)"}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
