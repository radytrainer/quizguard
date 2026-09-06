"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Inline point-input + feedback + Save control for one manually-gradable answer (essay always;
 * code_answer html/css in Phase 16), rendered next to that question's own answer display on the
 * teacher's attempt-detail page. `router.refresh()` after a successful save re-fetches the page's
 * server-loaded attempt data rather than tracking the new score/needsReview state locally here —
 * simpler, and correct by construction since the server is the only place that recomputes the
 * attempt total. */
export function GradeAnswerForm({
  quizId,
  attemptId,
  questionId,
  maxPoints,
  initialPointsAwarded,
  initialFeedback,
}: {
  quizId: string;
  attemptId: string;
  questionId: string;
  maxPoints: number;
  initialPointsAwarded: number;
  initialFeedback: string;
}) {
  const router = useRouter();
  const [pointsAwarded, setPointsAwarded] = useState(initialPointsAwarded);
  const [feedback, setFeedback] = useState(initialFeedback);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/quizzes/${quizId}/attempts/${attemptId}/answers/${questionId}/grade`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pointsAwarded,
            feedback: feedback || undefined,
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? "Failed to save grade.");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-outline-variant mt-3 flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          max={maxPoints}
          value={pointsAwarded}
          onChange={(e) =>
            setPointsAwarded(
              Math.min(maxPoints, Math.max(0, Number(e.target.value) || 0)),
            )
          }
          className="w-24"
        />
        <span className="text-muted-foreground text-sm">/ {maxPoints} pt</span>
      </div>
      <Textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Feedback for the student (optional)"
        className="min-h-20"
      />
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button
        size="sm"
        onClick={() => void handleSave()}
        disabled={saving}
        className="self-start"
      >
        {saving ? "Saving…" : "Save Grade"}
      </Button>
    </div>
  );
}
