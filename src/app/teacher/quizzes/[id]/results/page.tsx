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
import { getQuizResults } from "@/backend/results/results.service";
import { ApiError } from "@/lib/api-response";

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

export default async function QuizResultsPage({
  params,
}: PageProps<"/teacher/quizzes/[id]/results">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher" && user.role !== "admin") redirect("/dashboard");

  const { id } = await params;

  let results;
  try {
    results = await getQuizResults(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const maxBucketCount = Math.max(
    1,
    ...results.scoreDistribution.map((b) => b.count),
  );

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm">
            Quizzes / <span className="text-primary">Results</span>
          </p>
          <h1 className="text-2xl font-bold tracking-tight">
            {results.quizTitle}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/teacher/quizzes/${id}/attempts`}>View Attempts</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/quizzes/${id}/results/export`}>Export CSV</a>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs">Attempts</p>
            <p className="text-2xl font-bold">{results.totalAttempts}</p>
            <p className="text-muted-foreground text-xs">
              {results.finishedAttempts} finished
              {results.inProgressAttempts > 0 &&
                `, ${results.inProgressAttempts} in progress`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs">Average score</p>
            <p className="text-2xl font-bold">
              {formatPercent(results.averageScorePercent)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs">Pass rate</p>
            <p className="text-2xl font-bold">
              {formatPercent(results.passRate)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs">Passed / Failed</p>
            <p className="text-2xl font-bold">
              {results.passedCount} / {results.failedCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Score distribution</CardTitle>
          <CardDescription>
            Finished attempts, grouped by score percentage.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {results.finishedAttempts === 0 && (
            <p className="text-muted-foreground text-sm">
              No finished attempts yet.
            </p>
          )}
          {results.finishedAttempts > 0 &&
            results.scoreDistribution.map((bucket) => (
              <div
                key={bucket.label}
                className="flex items-center gap-3 text-sm"
              >
                <span className="text-muted-foreground w-20 shrink-0">
                  {bucket.label}
                </span>
                <div className="bg-muted h-4 flex-1 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{
                      width: `${(bucket.count / maxBucketCount) * 100}%`,
                    }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right font-mono text-xs">
                  {bucket.count}
                </span>
              </div>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Question difficulty ({results.questionStats.length})
          </CardTitle>
          <CardDescription>
            Sorted hardest first, based on finished attempts only.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {results.questionStats.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No finished attempts yet.
            </p>
          )}
          {results.questionStats.map((stat) => (
            <div key={stat.questionId} className="flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-3 text-sm">
                <span className="flex-1">{stat.text}</span>
                <Badge variant="outline" className="shrink-0">
                  {stat.timesCorrect} / {stat.timesAsked} correct
                </Badge>
              </div>
              <div className="bg-muted h-2 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full"
                  style={{ width: `${stat.percentCorrect}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
