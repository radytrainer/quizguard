import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/backend/auth/session";
import {
  getActivityHistory,
  listAttemptsForQuiz,
} from "@/backend/monitoring/monitoring.service";
import { getQuiz } from "@/backend/quizzes/quiz.service";
import { LiveMonitor } from "@/features/monitoring/live-monitor";
import { ApiError } from "@/lib/api-response";

export default async function QuizAttemptsPage({
  params,
}: PageProps<"/teacher/quizzes/[id]/attempts">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher" && user.role !== "admin") redirect("/dashboard");

  const { id } = await params;

  let quiz;
  try {
    quiz = await getQuiz(id, user);
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 404 || error.status === 403)
    )
      notFound();
    throw error;
  }
  const [attempts, history] = await Promise.all([
    listAttemptsForQuiz(id),
    getActivityHistory(id),
  ]);

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <p className="text-muted-foreground text-sm">
          Quizzes / <span className="text-primary">Attempts</span>
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{quiz.title}</h1>
      </div>

      <LiveMonitor
        quizId={id}
        quizTitle={quiz.title}
        initialAttempts={attempts}
        initialEvents={history.map((event) => ({
          ...event,
          occurredAt: event.occurredAt.toISOString(),
        }))}
      />
    </div>
  );
}
