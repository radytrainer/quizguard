import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/backend/auth/session";
import { getQuestion } from "@/backend/questions/question.service";
import { ApiError } from "@/lib/api-response";
import { QuestionForm } from "@/features/questions/question-form";

export default async function EditQuestionPage({
  params,
}: PageProps<"/teacher/questions/[id]/edit">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher" && user.role !== "admin") redirect("/dashboard");

  const { id } = await params;

  let question;
  try {
    question = await getQuestion(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-muted-foreground text-sm">
          Question Bank / <span className="text-primary">Edit Question</span>
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Question Builder</h1>
      </div>
      <QuestionForm
        initialData={{
          id: question.id,
          type: question.type,
          subject: question.subject,
          category: question.category,
          difficulty: question.difficulty,
          points: question.points,
          text: question.text,
          explanation: question.explanation,
          tags: question.tags,
          options: question.options.map((o) => ({
            text: o.text,
            isCorrect: o.isCorrect,
          })),
        }}
      />
    </div>
  );
}
