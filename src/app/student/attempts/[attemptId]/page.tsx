import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/backend/auth/session";
import { getAttempt } from "@/backend/attempts/attempt.service";
import { ExamAttempt } from "@/features/attempts/exam-attempt";
import { ApiError } from "@/lib/api-response";

export default async function AttemptPage({
  params,
}: PageProps<"/student/attempts/[attemptId]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "student") redirect("/dashboard");

  const { attemptId } = await params;

  let attempt;
  try {
    attempt = await getAttempt(attemptId, user.id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-8">
      <ExamAttempt
        initialAttempt={{
          ...attempt,
          startedAt: attempt.startedAt.toISOString(),
          deadlineAt: attempt.deadlineAt.toISOString(),
          submittedAt: attempt.submittedAt
            ? attempt.submittedAt.toISOString()
            : null,
        }}
      />
    </div>
  );
}
