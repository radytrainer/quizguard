import { redirect } from "next/navigation";

import { getCurrentUser } from "@/backend/auth/session";
import { QuizWizard } from "@/features/quizzes/wizard/quiz-wizard";

export default async function NewQuizPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher" && user.role !== "admin") redirect("/dashboard");

  return <QuizWizard />;
}
