import Link from "next/link";
import { redirect } from "next/navigation";
import { Radio, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/backend/auth/session";
import { listSessionsForHost } from "@/backend/live/live.service";

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

export default async function TeacherLivePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher" && user.role !== "admin") redirect("/dashboard");

  const sessions = await listSessionsForHost(user.id);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Live Games</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Host a Kahoot-style round from any published quiz — start one from the
          Quizzes page.
        </p>
      </div>

      {sessions.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
          No live games yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/teacher/live/${session.id}`}
              className="border-border hover:border-primary/40 flex flex-col gap-3 rounded-xl border p-4 transition-colors sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                  <Radio className="size-5" />
                </div>
                <div>
                  <p className="font-medium">{session.quizTitle}</p>
                  <p className="text-muted-foreground text-sm">
                    Code {session.joinCode} · {formatDate(session.createdAt)}
                  </p>
                </div>
              </div>
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
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
