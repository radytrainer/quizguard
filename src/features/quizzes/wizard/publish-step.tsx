"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  QuizAssignments,
  type AssignmentRow,
} from "@/features/quizzes/quiz-assignments";
import type { QuizStatus } from "@/database/schema";

export function PublishStep({
  quizId,
  quizTitle,
  initialStatus,
  initialAssignments,
}: {
  quizId: string;
  quizTitle: string;
  initialStatus: QuizStatus;
  initialAssignments: AssignmentRow[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePublish() {
    setPublishing(true);
    setError(null);
    const res = await fetch(`/api/quizzes/${quizId}/publish`, {
      method: "POST",
    });
    setPublishing(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(body?.error?.message ?? "Failed to publish.");
      return;
    }
    setStatus("published");
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{quizTitle}</CardTitle>
          <CardDescription>
            {status === "published"
              ? "Published — assign it below to make it visible to students."
              : "Still a draft. Publish it to start assigning it to classes or students."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Badge
            variant="outline"
            className={
              status === "published"
                ? "border-success/30 bg-success/10 text-success"
                : "text-muted-foreground"
            }
          >
            {status}
          </Badge>
          {status === "draft" && (
            <Button onClick={handlePublish} disabled={publishing}>
              {publishing ? "Publishing…" : "Publish Quiz"}
            </Button>
          )}
        </CardContent>
        {error && (
          <CardContent className="pt-0">
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          </CardContent>
        )}
      </Card>

      {status === "published" && (
        <QuizAssignments
          quizId={quizId}
          initialAssignments={initialAssignments}
        />
      )}

      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => router.push(`/teacher/quizzes/${quizId}/preview`)}
        >
          Done
        </Button>
      </div>
    </div>
  );
}
