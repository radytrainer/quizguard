import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/backend/auth/session";
import { getQuiz, getQuizQuestionPool } from "@/backend/quizzes/quiz.service";
import { ApiError } from "@/lib/api-response";
import { QuizLifecycleActions } from "@/features/quizzes/quiz-lifecycle-actions";
import { QuizQuestionPicker } from "@/features/quizzes/quiz-question-picker";
import { QuizSettingsForm } from "@/features/quizzes/quiz-settings-form";

export default async function EditQuizPage({
  params,
}: PageProps<"/teacher/quizzes/[id]/edit">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher" && user.role !== "admin") redirect("/dashboard");

  const { id } = await params;

  let quiz;
  try {
    quiz = await getQuiz(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const pool = await getQuizQuestionPool(id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm">
            Quizzes / <span className="text-primary">{quiz.title}</span>
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{quiz.title}</h1>
        </div>
        <QuizLifecycleActions quizId={quiz.id} status={quiz.status} />
      </div>

      <QuizQuestionPicker quizId={quiz.id} initialPool={pool} />

      <div className="max-w-2xl">
        <h2 className="mb-3 text-lg font-semibold">Settings</h2>
        <QuizSettingsForm
          initialData={{
            id: quiz.id,
            title: quiz.title,
            description: quiz.description,
            subject: quiz.subject,
            durationMinutes: quiz.durationMinutes,
            passingScore: quiz.passingScore,
            maxAttempts: quiz.maxAttempts,
            startAt: quiz.startAt,
            endAt: quiz.endAt,
            randomizeQuestions: quiz.randomizeQuestions,
            randomizeOptions: quiz.randomizeOptions,
            fullscreenRequired: quiz.fullscreenRequired,
            monitorActivity: quiz.monitorActivity,
            autoSave: quiz.autoSave,
            autoSubmit: quiz.autoSubmit,
            showResults: quiz.showResults,
            questionsPerAttempt: quiz.questionsPerAttempt,
          }}
        />
      </div>
    </div>
  );
}
