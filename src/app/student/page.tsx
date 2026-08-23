import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Award,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  ListChecks,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/backend/auth/session";
import { listAssignmentsForStudent } from "@/backend/assignments/assignment.service";
import { listAttemptHistory } from "@/backend/attempts/attempt.service";
import { LogoutButton } from "@/features/auth/logout-button";
import { JoinLiveForm } from "@/features/live/join-live-form";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  in_progress: "In progress",
  submitted: "Submitted",
  auto_submitted: "Auto-submitted",
};

function formatDateTime(value: Date): string {
  return value.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "primary",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone?: "primary" | "success";
}) {
  return (
    <div className="border-border bg-card flex min-w-0 flex-col items-center gap-1.5 rounded-xl border p-3 text-center sm:p-4">
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          tone === "success"
            ? "bg-success/10 text-success"
            : "bg-primary/10 text-primary",
        )}
      >
        <Icon className="size-4.5" />
      </div>
      <p className="text-lg leading-none font-bold sm:text-xl">{value}</p>
      <p className="text-muted-foreground truncate text-xs">{label}</p>
    </div>
  );
}

export default async function StudentPage({
  searchParams,
}: PageProps<"/student">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "student") redirect("/dashboard");

  const [assignments, history, resolvedSearchParams] = await Promise.all([
    listAssignmentsForStudent(user.id),
    listAttemptHistory(user.id),
    searchParams,
  ]);
  const codeParam = resolvedSearchParams.code;
  const joinCode = Array.isArray(codeParam) ? codeParam[0] : codeParam;

  const inProgressByQuiz = new Map(
    history
      .filter((a) => a.status === "in_progress")
      .map((a) => [a.quizId, a.id]),
  );
  const finishedHistory = history.filter((a) => a.status !== "in_progress");
  const passedCount = finishedHistory.filter((a) => a.passed).length;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Student Dashboard
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Welcome back, {user.name}.
          </p>
        </div>
        <LogoutButton />
      </div>

      <JoinLiveForm initialCode={joinCode} />

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          icon={ClipboardList}
          label="Assigned"
          value={assignments.length}
        />
        <StatCard
          icon={ListChecks}
          label="Completed"
          value={finishedHistory.length}
        />
        <StatCard
          icon={Award}
          label="Passed"
          value={passedCount}
          tone="success"
        />
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Assigned quizzes ({assignments.length})
          </h2>
          <p className="text-muted-foreground text-sm">
            Assigned directly to you or through a class you&apos;re enrolled in.
          </p>
        </div>

        {assignments.length === 0 ? (
          <p className="border-border text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
            No quizzes assigned yet.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {assignments.map((assignment) => {
              const inProgressAttemptId = inProgressByQuiz.get(
                assignment.quizId,
              );
              return (
                <div
                  key={assignment.id}
                  className="border-border hover:border-primary/40 flex flex-col gap-4 rounded-xl border p-4 transition-colors sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                      <ClipboardList className="size-5" />
                    </div>
                    <div>
                      <p className="font-medium">{assignment.quizTitle}</p>
                      <p className="text-muted-foreground text-sm">
                        {assignment.subject} · {assignment.durationMinutes}{" "}
                        minutes
                      </p>
                      {assignment.endAt && (
                        <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                          <CalendarClock className="size-3.5" />
                          Available until {formatDateTime(assignment.endAt)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:shrink-0">
                    <Badge variant="outline">
                      {assignment.assignedVia === "class"
                        ? "Via class"
                        : "Direct"}
                    </Badge>
                    {inProgressAttemptId ? (
                      <Button size="sm" asChild>
                        <Link href={`/student/attempts/${inProgressAttemptId}`}>
                          Resume
                        </Link>
                      </Button>
                    ) : (
                      <Button size="sm" asChild>
                        <Link
                          href={`/student/quizzes/${assignment.quizId}/start`}
                        >
                          Start
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {finishedHistory.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Past attempts
          </h2>
          <div className="flex flex-col gap-3">
            {finishedHistory.map((attempt) => (
              <Link
                key={attempt.id}
                href={`/student/attempts/${attempt.id}`}
                className="border-border hover:border-primary/40 hover:bg-secondary/30 flex flex-col gap-4 rounded-xl border p-4 text-sm transition-colors sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-lg",
                      attempt.passed
                        ? "bg-success/10 text-success"
                        : "bg-destructive/10 text-destructive",
                    )}
                  >
                    {attempt.passed ? (
                      <CheckCircle2 className="size-5" />
                    ) : (
                      <XCircle className="size-5" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{attempt.quizTitle}</p>
                    <p className="text-muted-foreground text-xs">
                      Attempt {attempt.attemptNumber} ·{" "}
                      {STATUS_LABELS[attempt.status]}
                      {attempt.submittedAt &&
                        ` · ${formatDateTime(attempt.submittedAt)}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:shrink-0">
                  <span className="font-mono text-xs">
                    {attempt.score} / {attempt.maxScore}
                  </span>
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
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
