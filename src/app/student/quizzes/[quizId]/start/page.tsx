import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  ListChecks,
  MonitorPlay,
  RotateCw,
  Save,
  ShieldAlert,
  Timer,
} from "lucide-react";

import { getCurrentUser } from "@/backend/auth/session";
import {
  listAssignmentsForStudent,
  type StudentAssignment,
} from "@/backend/assignments/assignment.service";
import { listAttemptHistory } from "@/backend/attempts/attempt.service";
import { StartAttemptButton } from "@/features/attempts/start-attempt-button";

function StatCard({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof ListChecks;
  value: string | number;
  label: string;
}) {
  return (
    <div className="border-outline-variant flex flex-col items-center gap-2 rounded-lg border p-4 text-center">
      <Icon className="text-muted-foreground size-5" />
      <span className="text-primary text-lg font-bold">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

function InstructionRow({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof MonitorPlay;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-md">
        <Icon className="size-4" />
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </div>
  );
}

export default async function ExamInstructionsPage({
  params,
}: PageProps<"/student/quizzes/[quizId]/start">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "student") redirect("/dashboard");

  const { quizId } = await params;

  const [assignments, history] = await Promise.all([
    listAssignmentsForStudent(user.id),
    listAttemptHistory(user.id),
  ]);

  const assignment: StudentAssignment | undefined = assignments.find(
    (a) => a.quizId === quizId,
  );
  if (!assignment) notFound();

  const inProgress = history.find(
    (a) => a.quizId === quizId && a.status === "in_progress",
  );
  if (inProgress) redirect(`/student/attempts/${inProgress.id}`);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8">
      <Link
        href="/student"
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" />
        Back to Dashboard
      </Link>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {assignment.quizTitle}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Please review the exam parameters and academic integrity guidelines
          below before initiating your session. Once started, the timer cannot
          be paused.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={ListChecks}
          value={assignment.questionsPerAttempt}
          label="Questions"
        />
        <StatCard
          icon={Timer}
          value={`${assignment.durationMinutes}:00`}
          label="Minutes"
        />
        <StatCard
          icon={RotateCw}
          value={assignment.maxAttempts}
          label={assignment.maxAttempts === 1 ? "Attempt" : "Attempts"}
        />
        <StatCard
          icon={BadgeCheck}
          value={`${assignment.passingScore}%`}
          label="Passing Score"
        />
      </div>

      <div className="border-outline-variant rounded-lg border p-6">
        <h2 className="text-base font-semibold">Important Instructions</h2>
        <div className="divide-outline-variant mt-3 flex flex-col divide-y">
          {assignment.fullscreenRequired && (
            <InstructionRow
              icon={MonitorPlay}
              title="Fullscreen Environment Required"
              description="The exam will automatically launch in fullscreen mode. Do not attempt to exit or minimize the window during the assessment."
            />
          )}
          <InstructionRow
            icon={ShieldAlert}
            title="Stay on the Exam Page"
            description="Navigating away, opening new tabs, or using external applications is prohibited and will be recorded."
          />
          {assignment.autoSave && (
            <InstructionRow
              icon={Save}
              title="Continuous Auto-Save"
              description="Your progress is automatically saved every few seconds. If you experience a network disruption, your answers will be preserved."
            />
          )}
        </div>
      </div>

      {assignment.monitorActivity && (
        <div className="border-primary/20 bg-primary/5 flex items-start gap-4 rounded-lg border p-6">
          <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full">
            <ShieldAlert className="size-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold">
              Exam Activity Monitoring Active
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              To maintain a fair testing environment, this session utilizes
              automated monitoring. The system will log instances of{" "}
              <strong className="text-foreground">focus loss</strong>,{" "}
              <strong className="text-foreground">fullscreen exits</strong>, and{" "}
              <strong className="text-foreground">
                page visibility changes
              </strong>
              . These events are reported directly to your instructor for
              review. Please close all unnecessary applications before
              proceeding.
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-end border-t pt-6">
        <StartAttemptButton quizId={assignment.quizId} />
      </div>
    </div>
  );
}
