"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function ReleaseResultsToggle({
  quizId,
  initialShowResults,
}: {
  quizId: string;
  initialShowResults: boolean;
}) {
  const router = useRouter();
  const [showResults, setShowResults] = useState(initialShowResults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const path = showResults ? "hide-results" : "release-results";
    const res = await fetch(`/api/quizzes/${quizId}/${path}`, {
      method: "POST",
    });
    setBusy(false);

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(body?.error?.message ?? "Failed to update.");
      return;
    }
    setShowResults((prev) => !prev);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={
            showResults
              ? "border-success/30 bg-success/10 text-success"
              : "border-outline-variant bg-muted text-muted-foreground"
          }
        >
          {showResults ? "Answers released" : "Answers hidden"}
        </Badge>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={toggle}
        >
          {showResults ? "Hide answers" : "Release answers"}
        </Button>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
