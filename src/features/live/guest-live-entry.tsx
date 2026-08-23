"use client";

import { useState } from "react";
import { Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LivePlayerView } from "@/features/live/live-player-view";

const GUEST_NAME_MAX_LENGTH = 40;

/** The Kahoot-style "what's your name" step for a no-account guest — shown once, before the
 * socket ever joins the game, so live-player-view.tsx never has to render a name prompt itself.
 * Nothing here is persisted beyond this render: the name only leaves this tab as part of the
 * `live:join` payload. */
export function GuestLiveEntry({
  sessionId,
  quizTitle,
}: {
  sessionId: string;
  quizTitle: string;
}) {
  const [name, setName] = useState("");
  const [submittedName, setSubmittedName] = useState<string | null>(null);

  if (submittedName) {
    return <LivePlayerView sessionId={sessionId} guestName={submittedName} />;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim().slice(0, GUEST_NAME_MAX_LENGTH);
    if (!trimmed) return;
    setSubmittedName(trimmed);
  }

  return (
    <div className="border-border bg-card mx-auto flex w-full max-w-sm flex-col gap-5 rounded-2xl border p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
          <Radio className="size-6" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">{quizTitle}</h1>
        <p className="text-muted-foreground text-sm">
          Enter your name to join. You&apos;re not signed in — this game
          won&apos;t be saved to any account.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={GUEST_NAME_MAX_LENGTH}
          className="h-12 text-center text-lg"
          aria-label="Your name"
          autoFocus
        />
        <Button type="submit" size="lg" disabled={name.trim().length === 0}>
          Enter Game
        </Button>
      </form>
    </div>
  );
}
