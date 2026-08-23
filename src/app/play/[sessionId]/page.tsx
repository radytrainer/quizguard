import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireSession } from "@/backend/live/live.service";
import { getQuiz } from "@/backend/quizzes/quiz.service";
import { GuestLiveEntry } from "@/features/live/guest-live-entry";
import { ApiError } from "@/lib/api-response";

export default async function PlaySessionPage({
  params,
}: PageProps<"/play/[sessionId]">) {
  const { sessionId } = await params;

  let session;
  try {
    session = await requireSession(sessionId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // A class-restricted game (host-setup-form.tsx's "X only" option) needs an enrolled student
  // account to check against — there's no way to verify that for a guest, so this stops short
  // of the name step rather than letting them hit the same rejection from the socket layer
  // after already typing a name.
  if (session.classId) {
    return (
      <main className="flex flex-1 items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="border-border bg-card mx-auto flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border p-8 text-center">
          <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
            <Lock className="size-6" />
          </div>
          <p className="font-medium">This game requires an account.</p>
          <p className="text-muted-foreground text-sm">
            The host restricted this game to a specific class. Log in with
            your student account to join.
          </p>
          <Button asChild>
            <Link href="/login">Log in</Link>
          </Button>
        </div>
      </main>
    );
  }

  const quiz = await getQuiz(session.quizId);

  return (
    <main className="flex flex-1 items-center justify-center p-4 sm:p-6 lg:p-8">
      <GuestLiveEntry sessionId={sessionId} quizTitle={quiz.title} />
    </main>
  );
}
