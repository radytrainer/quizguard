import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/backend/auth/session";
import { listAttemptsPendingReview } from "@/backend/grading/grading.service";

export default async function GradingQueuePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher" && user.role !== "admin") redirect("/dashboard");

  const attempts = await listAttemptsPendingReview(user);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Grading Queue</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Attempts with at least one essay (or other manually-graded) answer
          still awaiting a grade.
        </p>
      </div>

      {attempts.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            Nothing needs grading right now.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {attempts.map((attempt) => (
            <Link
              key={attempt.attemptId}
              href={`/teacher/quizzes/${attempt.quizId}/attempts/${attempt.attemptId}`}
              className="border-outline-variant hover:border-primary/50 hover:bg-accent flex items-center justify-between gap-3 rounded-lg border p-4 text-sm transition-colors"
            >
              <div>
                <p className="font-medium">{attempt.studentName}</p>
                <p className="text-muted-foreground">{attempt.quizTitle}</p>
              </div>
              <Badge
                variant="outline"
                className="border-warning/30 bg-warning/10 text-warning shrink-0"
              >
                {attempt.pendingCount} pending
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
