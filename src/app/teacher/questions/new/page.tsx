import { redirect } from "next/navigation";

import { getCurrentUser } from "@/backend/auth/session";
import { QuestionForm } from "@/features/questions/question-form";

export default async function NewQuestionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher" && user.role !== "admin") redirect("/dashboard");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-muted-foreground text-sm">
          Question Bank / <span className="text-primary">New Question</span>
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Question Builder</h1>
      </div>
      <QuestionForm />
    </div>
  );
}
