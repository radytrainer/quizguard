import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/backend/auth/session";
import { requireSession } from "@/backend/live/live.service";
import { getQuiz } from "@/backend/quizzes/quiz.service";
import { LiveHostView } from "@/features/live/live-host-view";
import { ApiError } from "@/lib/api-response";

export default async function TeacherLiveSessionPage({
  params,
}: PageProps<"/teacher/live/[sessionId]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher" && user.role !== "admin") redirect("/dashboard");

  const { sessionId } = await params;

  let session;
  try {
    session = await requireSession(sessionId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  if (user.role === "teacher" && session.hostId !== user.id) {
    redirect("/teacher/live");
  }

  const quiz = await getQuiz(session.quizId);

  return (
    <main className="flex flex-1 flex-col p-4 sm:p-6 lg:p-8">
      <LiveHostView
        sessionId={session.id}
        quizTitle={quiz.title}
        joinCode={session.joinCode}
        initialStatus={session.status}
      />
    </main>
  );
}
