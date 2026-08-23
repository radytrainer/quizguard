"use client";

import { useState } from "react";
import Link from "next/link";
import { Radio, Trash2, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_LABELS: Record<string, string> = {
  lobby: "Lobby",
  question: "Live",
  reveal: "Live",
  leaderboard: "Live",
  finished: "Finished",
  cancelled: "Cancelled",
};

const STATUS_STYLES: Record<string, string> = {
  lobby: "border-warning/30 bg-warning/10 text-warning",
  question: "border-success/30 bg-success/10 text-success",
  reveal: "border-success/30 bg-success/10 text-success",
  leaderboard: "border-success/30 bg-success/10 text-success",
  finished: "border-border bg-muted text-muted-foreground",
  cancelled: "border-border bg-muted text-muted-foreground",
};

function formatDate(value: Date): string {
  return value.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export interface LiveGameListItem {
  id: string;
  quizTitle: string;
  status: string;
  joinCode: string;
  participantCount: number;
  createdAt: Date;
}

export function LiveGamesList({
  sessions: initialSessions,
}: {
  sessions: LiveGameListItem[];
}) {
  const [sessions, setSessions] = useState(initialSessions);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove(id: string, quizTitle: string) {
    if (
      !confirm(`Remove "${quizTitle}" from this list? This cannot be undone.`)
    ) {
      return;
    }
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/live/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? "Failed to remove this game.");
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  if (sessions.length === 0) {
    return (
      <p className="border-border text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
        No live games yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {sessions.map((session) => {
        // Only a game that's actually over can be removed — an active one (lobby/live) should
        // be ended first, so a teacher can't delete a game students are still in.
        const canRemove =
          session.status === "finished" || session.status === "cancelled";
        return (
          <div
            key={session.id}
            className="border-border hover:border-primary/40 flex flex-col gap-3 rounded-xl border p-4 transition-colors sm:flex-row sm:items-center sm:justify-between"
          >
            <Link
              href={`/teacher/live/${session.id}`}
              className="flex min-w-0 flex-1 items-start gap-3"
            >
              <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                <Radio className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium">{session.quizTitle}</p>
                <p className="text-muted-foreground text-sm">
                  Code {session.joinCode} · {formatDate(session.createdAt)}
                </p>
              </div>
            </Link>
            <div className="flex items-center gap-2 sm:shrink-0">
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                <Users className="size-3.5" />
                {session.participantCount}
              </span>
              <Badge
                variant="outline"
                className={STATUS_STYLES[session.status]}
              >
                {STATUS_LABELS[session.status]}
              </Badge>
              {canRemove && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${session.quizTitle}`}
                  disabled={deletingId === session.id}
                  onClick={() =>
                    void handleRemove(session.id, session.quizTitle)
                  }
                >
                  <Trash2 className="text-destructive size-4" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
