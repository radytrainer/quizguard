"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { QuizStatus } from "@/database/schema";

const STATUS_STYLES: Record<QuizStatus, string> = {
  draft: "border-outline-variant bg-muted text-muted-foreground",
  published: "border-success/30 bg-success/10 text-success",
  archived: "border-warning/30 bg-warning/10 text-warning",
};

export function QuizLifecycleActions({
  quizId,
  status,
}: {
  quizId: string;
  status: QuizStatus;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function callApi(path: string, method: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/quizzes/${quizId}${path}`, { method });
    setBusy(false);

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(body?.error?.message ?? "Action failed.");
      return;
    }

    if (path === "" && method === "DELETE") {
      router.push("/teacher/quizzes");
      return;
    }
    if (path === "/duplicate") {
      const { quiz } = (await res.json()) as { quiz: { id: string } };
      router.push(`/teacher/quizzes/${quiz.id}/edit`);
      return;
    }
    router.refresh();
  }

  function handleDelete() {
    if (!confirm("Delete this quiz? This cannot be undone.")) return;
    void callApi("", "DELETE");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={STATUS_STYLES[status]}>
          {status}
        </Badge>
        {status === "draft" && (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => callApi("/publish", "POST")}
          >
            Publish
          </Button>
        )}
        {status === "published" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => callApi("/unpublish", "POST")}
          >
            Unpublish
          </Button>
        )}
        {status !== "archived" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => callApi("/archive", "POST")}
          >
            Archive
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => callApi("/duplicate", "POST")}
        >
          Duplicate
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-destructive"
          disabled={busy}
          onClick={handleDelete}
        >
          Delete
        </Button>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
