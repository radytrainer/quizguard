import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/backend/auth/session";
import { requireSession } from "@/backend/live/live.service";
import { LivePlayerView } from "@/features/live/live-player-view";
import { ApiError } from "@/lib/api-response";

export default async function StudentLiveSessionPage({
  params,
}: PageProps<"/student/live/[sessionId]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "student") redirect("/dashboard");

  const { sessionId } = await params;

  // Existence only — class/roster access is enforced server-side when the socket actually
  // joins (live.service.ts's joinSession), which surfaces a rejection via live:error.
  try {
    await requireSession(sessionId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <main className="flex flex-1 flex-col p-4 sm:p-6 lg:p-8">
      <LivePlayerView sessionId={sessionId} />
    </main>
  );
}
