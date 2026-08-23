import { redirect } from "next/navigation";

import { getCurrentUser } from "@/backend/auth/session";
import { listSessionsForHost } from "@/backend/live/live.service";
import { LiveGamesList } from "@/features/live/live-games-list";

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

      <LiveGamesList sessions={sessions} />
    </div>
  );
}
