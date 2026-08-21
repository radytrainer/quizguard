import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/backend/auth/session";
import { listClasses } from "@/backend/classes/class.service";
import { getQuiz } from "@/backend/quizzes/quiz.service";
import { HostSetupForm } from "@/features/live/host-setup-form";
import { ApiError } from "@/lib/api-response";

export default async function HostQuizPage({
  params,
}: PageProps<"/teacher/quizzes/[id]/host">) {
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
  if (user.role === "teacher" && quiz.createdBy !== user.id) {
    redirect("/teacher/quizzes");
  }
  if (quiz.status !== "published") {
    redirect(`/teacher/quizzes/${id}/preview`);
  }

  const { items } = await listClasses({ page: 1, pageSize: 100 });
  const classes = items
    .filter((c) => user.role === "admin" || c.teacherId === user.id)
    .map((c) => ({ id: c.id, name: c.name }));

  return (
    <main className="flex flex-1 items-center justify-center p-4 sm:p-6 lg:p-8">
      <HostSetupForm quizId={id} quizTitle={quiz.title} classes={classes} />
    </main>
  );
}
