import { redirect } from "next/navigation";

import { getCurrentUser } from "@/backend/auth/session";
import { QuizList } from "@/features/quizzes/quiz-list";

export default async function QuizzesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher" && user.role !== "admin") redirect("/dashboard");

  return <QuizList />;
}
