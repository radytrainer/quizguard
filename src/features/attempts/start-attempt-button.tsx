"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function StartAttemptButton({ quizId }: { quizId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/quizzes/${quizId}/attempts`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? "Failed to start this quiz.");
        return;
      }
      const data = (await res.json()) as { attempt: { id: string } };
      router.push(`/student/attempts/${data.attempt.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={handleClick} disabled={loading}>
        {loading ? "Starting…" : "I Understand — Start Exam"}
        <ArrowRight className="size-4" />
      </Button>
      {error && <span className="text-destructive text-xs">{error}</span>}
    </div>
  );
}
