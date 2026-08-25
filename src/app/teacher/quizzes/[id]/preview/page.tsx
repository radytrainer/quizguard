import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/backend/auth/session";
import { listAssignmentsForQuiz } from "@/backend/assignments/assignment.service";
import { getQuiz, getQuizQuestionPool } from "@/backend/quizzes/quiz.service";
import { QuizAssignments } from "@/features/quizzes/quiz-assignments";
import { ApiError } from "@/lib/api-response";

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: "Multiple Choice",
  true_false: "True/False",
  multiple_answer: "Multiple Answer",
  short_answer: "Short Answer",
  fill_in_blank: "Fill in the Blank",
};

export default async function PreviewQuizPage({
  params,
}: PageProps<"/teacher/quizzes/[id]/preview">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher" && user.role !== "admin") redirect("/dashboard");

  const { id } = await params;

  let quiz;
  try {
    quiz = await getQuiz(id, user);
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 404 || error.status === 403)
    )
      notFound();
    throw error;
  }
  const pool = await getQuizQuestionPool(id, user);
  const assignments = await listAssignmentsForQuiz(id);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm">
            <Link
              href="/teacher/quizzes"
              className="hover:text-foreground hover:underline"
            >
              Quizzes
            </Link>{" "}
            / <span className="text-primary">Preview</span>
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{quiz.title}</h1>
          {quiz.description && (
            <p className="text-muted-foreground mt-1">{quiz.description}</p>
          )}
        </div>
        {quiz.status === "published" && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/teacher/quizzes/${id}/results`}>Results</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/teacher/quizzes/${id}/attempts`}>
                View Attempts
              </Link>
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overview</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground">Subject</p>
            <p className="font-medium">{quiz.subject}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Duration</p>
            <p className="font-medium">{quiz.durationMinutes} minutes</p>
          </div>
          <div>
            <p className="text-muted-foreground">Passing score</p>
            <p className="font-medium">{quiz.passingScore}%</p>
          </div>
          <div>
            <p className="text-muted-foreground">Max attempts</p>
            <p className="font-medium">{quiz.maxAttempts}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Questions per attempt</p>
            <p className="font-medium">
              {quiz.questionsPerAttempt} of {pool.length} pooled
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Randomization</p>
            <p className="font-medium">
              {quiz.randomizeQuestions ? "Questions" : ""}
              {quiz.randomizeQuestions && quiz.randomizeOptions ? " + " : ""}
              {quiz.randomizeOptions ? "Options" : ""}
              {!quiz.randomizeQuestions && !quiz.randomizeOptions && "None"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Question Pool ({pool.length})
          </CardTitle>
          <CardDescription>
            The order shown here is the fixed order used when randomization is
            off.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {pool.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No questions have been added to this quiz yet.
            </p>
          )}
          {pool.map((question, index) => (
            <div
              key={question.id}
              className="border-outline-variant rounded-lg border p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm">
                  <span className="text-muted-foreground mr-2">
                    {index + 1}.
                  </span>
                  {question.text}
                </p>
                <div className="flex shrink-0 gap-1.5">
                  <Badge variant="outline">{TYPE_LABELS[question.type]}</Badge>
                  <Badge variant="outline">{question.points} pt</Badge>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div id="assignments" className="scroll-mt-24">
        {quiz.status === "published" ? (
          <QuizAssignments
            quizId={id}
            initialAssignments={assignments.map((a) => ({
              id: a.id,
              classId: a.classId,
              studentId: a.studentId,
              targetName: a.targetName,
              startAt: a.startAt ? a.startAt.toISOString() : null,
              endAt: a.endAt ? a.endAt.toISOString() : null,
            }))}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assignments</CardTitle>
              <CardDescription>
                Publish this quiz before assigning it to a class or students.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}
