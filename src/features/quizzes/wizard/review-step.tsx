"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { WizardFormState } from "@/features/quizzes/wizard/types";

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export function ReviewStep({
  quizId,
  form,
  onEditStep,
}: {
  quizId: string;
  form: WizardFormState;
  onEditStep: (step: number) => void;
}) {
  const [questionCount, setQuestionCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      try {
        const res = await fetch(`/api/quizzes/${quizId}/questions`);
        if (!res.ok) return;
        const data = (await res.json()) as { pool: unknown[] };
        if (!cancelled) setQuestionCount(data.pool.length);
      } catch {
        // Best-effort — the count just stays unknown, doesn't block review.
      }
    });
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  const poolTooSmall =
    questionCount !== null && questionCount < form.questionsPerAttempt;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Details</CardTitle>
          <Button variant="link" size="sm" onClick={() => onEditStep(1)}>
            Edit
          </Button>
        </CardHeader>
        <CardContent>
          <SummaryRow label="Title" value={form.title} />
          <SummaryRow label="Subject" value={form.subject} />
          <SummaryRow
            label="Duration"
            value={`${form.durationMinutes} minutes`}
          />
          <SummaryRow label="Passing score" value={`${form.passingScore}%`} />
          <SummaryRow label="Max attempts" value={String(form.maxAttempts)} />
          <SummaryRow
            label="Questions per attempt"
            value={String(form.questionsPerAttempt)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Questions</CardTitle>
          <Button variant="link" size="sm" onClick={() => onEditStep(2)}>
            Edit
          </Button>
        </CardHeader>
        <CardContent>
          <SummaryRow
            label="Pool size"
            value={questionCount === null ? "…" : String(questionCount)}
          />
          {poolTooSmall && (
            <p className="text-destructive mt-2 text-sm">
              The pool ({questionCount}) is smaller than questions per attempt (
              {form.questionsPerAttempt}) — publishing will fail until you add
              more.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Rules</CardTitle>
          <Button variant="link" size="sm" onClick={() => onEditStep(3)}>
            Edit
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className={
                form.fullscreenRequired
                  ? "border-warning/30 bg-warning/10 text-warning"
                  : "text-muted-foreground"
              }
            >
              {form.fullscreenRequired
                ? "Fullscreen required"
                : "Fullscreen not required"}
            </Badge>
            <Badge
              variant="outline"
              className={
                form.monitorActivity
                  ? "border-warning/30 bg-warning/10 text-warning"
                  : "text-muted-foreground"
              }
            >
              {form.monitorActivity
                ? "Activity monitored"
                : "Activity not monitored"}
            </Badge>
            <Badge variant="outline" className="text-muted-foreground">
              {form.showResults
                ? "Shows results to students"
                : "Hides results from students"}
            </Badge>
          </div>
          <CardDescription>
            {form.startAt || form.endAt
              ? `Available ${form.startAt ? `from ${new Date(form.startAt).toLocaleString()}` : ""}${form.endAt ? ` until ${new Date(form.endAt).toLocaleString()}` : ""}.`
              : "No access window set — available as soon as it's published and assigned."}
          </CardDescription>
        </CardContent>
      </Card>
    </div>
  );
}
