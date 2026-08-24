import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/backend/auth/session";
import { getClass, listRoster } from "@/backend/classes/class.service";
import { getClassResults } from "@/backend/results/results.service";
import { ClassRoster } from "@/features/classes/class-roster";
import { ApiError } from "@/lib/api-response";

export default async function ClassRosterPage({
  params,
}: PageProps<"/teacher/classes/[id]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher" && user.role !== "admin") redirect("/dashboard");

  const { id } = await params;

  let cls;
  try {
    cls = await getClass(id, user);
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 404 || error.status === 403)
    )
      notFound();
    throw error;
  }
  const roster = await listRoster(id, user);
  const results = await getClassResults(id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-muted-foreground text-sm">
          Classes / <span className="text-primary">{cls.name}</span>
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{cls.name}</h1>
      </div>
      <ClassRoster classId={id} initialRoster={roster} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quiz results</CardTitle>
          <CardDescription>
            Pass rate among this class&apos;s roster, per assigned quiz.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {results.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No quizzes assigned to this class yet.
            </p>
          )}
          {results.map((result) => (
            <Link
              key={result.quizId}
              href={`/teacher/quizzes/${result.quizId}/results`}
              className="border-outline-variant hover:bg-secondary flex items-center justify-between gap-3 rounded-lg border p-3 text-sm transition-colors"
            >
              <span className="font-medium">{result.quizTitle}</span>
              <span className="text-muted-foreground">
                {result.attemptedCount} / {result.rosterCount} attempted ·{" "}
                {result.passRate === null
                  ? "no results yet"
                  : `${Math.round(result.passRate)}% passed`}
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
