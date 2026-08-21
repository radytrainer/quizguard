import { redirect } from "next/navigation";

import { getCurrentUser } from "@/backend/auth/session";
import { QuestionList } from "@/features/questions/question-list";

export default async function QuestionBankPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher" && user.role !== "admin") redirect("/dashboard");

  return <QuestionList />;
}
