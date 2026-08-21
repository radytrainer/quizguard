import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CheckCircle2,
  FileQuestion,
  Flag,
  Hourglass,
  Plus,
  TrendingUp,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/backend/auth/session";
import { getTeacherDashboard } from "@/backend/dashboard/dashboard.service";
import { PassFailDonut } from "@/features/dashboard/pass-fail-donut";
import { PerformanceChart } from "@/features/dashboard/performance-chart";

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${String(remainingSeconds).padStart(2, "0")}s`;
}

export default async function TeacherPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect("/dashboard");

  const dashboard = await getTeacherDashboard(user.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Summary across every quiz and class you own.
          </p>
        </div>
        <Button asChild>
          <Link href="/teacher/quizzes/new">
            <Plus className="size-4" />
            New Quiz
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardContent className="flex items-start justify-between pt-6">
            <div>
              <p className="text-muted-foreground text-sm">Total Quizzes</p>
              <p className="text-2xl font-bold tracking-tight">
                {dashboard.totalQuizzes}
              </p>
            </div>
            <FileQuestion className="text-muted-foreground size-5" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start justify-between pt-6">
            <div>
              <p className="text-muted-foreground text-sm">Total Students</p>
              <p className="text-2xl font-bold tracking-tight">
                {dashboard.totalStudents}
              </p>
            </div>
            <Users className="text-muted-foreground size-5" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start justify-between pt-6">
            <div>
              <p className="text-muted-foreground text-sm">Completed</p>
              <p className="text-2xl font-bold tracking-tight">
                {dashboard.completedAttempts}
              </p>
            </div>
            <CheckCircle2 className="text-success size-5" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start justify-between pt-6">
            <div>
              <p className="text-muted-foreground text-sm">In Progress</p>
              <p className="text-2xl font-bold tracking-tight">
                {dashboard.inProgressAttempts}
              </p>
            </div>
            <Hourglass className="text-warning size-5" />
          </CardContent>
        </Card>
        <Card
          className={
            dashboard.flaggedAttempts > 0 ? "border-destructive/30" : ""
          }
        >
          <CardContent className="flex items-start justify-between pt-6">
            <div>
              <p className="text-muted-foreground text-sm">Flagged</p>
              <p className="text-destructive text-2xl font-bold tracking-tight">
                {dashboard.flaggedAttempts}
              </p>
            </div>
            <Flag className="text-destructive size-5" />
          </CardContent>
        </Card>
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="flex items-start justify-between pt-6">
            <div>
              <p className="text-primary-foreground/80 text-sm">Avg. Score</p>
              <p className="text-2xl font-bold tracking-tight">
                {formatPercent(dashboard.averageScorePercent)}
              </p>
            </div>
            <TrendingUp className="size-5" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Performance Over Time</CardTitle>
            <CardDescription>
              Average score across finished attempts, by week.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PerformanceChart points={dashboard.performanceOverTime} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pass vs Fail Rate</CardTitle>
            <CardDescription>
              Every finished attempt, all quizzes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PassFailDonut
              passed={dashboard.passedCount}
              failed={dashboard.failedCount}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Submissions</CardTitle>
          <CardDescription>
            The last {dashboard.recentSubmissions.length} finished attempts
            across your quizzes.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Quiz</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Time Spent</TableHead>
                <TableHead>Violations</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard.recentSubmissions.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-muted-foreground py-8 text-center"
                  >
                    No finished attempts yet.
                  </TableCell>
                </TableRow>
              )}
              {dashboard.recentSubmissions.map((submission) => (
                <TableRow key={submission.attemptId}>
                  <TableCell className="font-medium">
                    {submission.studentName}
                  </TableCell>
                  <TableCell>{submission.quizTitle}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {formatPercent(submission.scorePercent)}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {formatDuration(submission.timeSpentSeconds)}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {submission.violationCount}
                  </TableCell>
                  <TableCell>
                    {submission.flagged ? (
                      <Badge
                        variant="outline"
                        className="border-destructive/30 bg-destructive/10 text-destructive"
                      >
                        Flagged
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-success/30 bg-success/10 text-success"
                      >
                        Normal
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right text-sm">
                    {submission.submittedAt.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
