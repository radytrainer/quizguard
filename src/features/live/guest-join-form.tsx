"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function readErrorMessage(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? fallback;
}

// The public, no-account entry point for a live game (Section: "anyone with the code" guest
// play) — unlike features/live/join-live-form.tsx, this never assumes a logged-in student, so
// it resolves the code and hands off to /play/[sessionId] for the name step rather than
// /student/live/[sessionId].
export function GuestJoinForm({ initialCode }: { initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/live/by-code/${code.trim()}`);
      if (!res.ok) {
        setError(await readErrorMessage(res, "No active game with that code."));
        return;
      }
      const data = (await res.json()) as { sessionId: string };
      router.push(`/play/${data.sessionId}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-border bg-card mx-auto flex w-full max-w-sm flex-col gap-5 rounded-2xl border p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
          <Radio className="size-6" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">Join a game</h1>
        <p className="text-muted-foreground text-sm">
          Enter the code your teacher shared. No account needed.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          maxLength={6}
          inputMode="numeric"
          className="h-12 text-center font-mono text-2xl tracking-widest"
          aria-label="Join code"
          autoFocus
        />
        <Button
          type="submit"
          size="lg"
          disabled={submitting || code.trim().length === 0}
        >
          {submitting ? "Checking…" : "Enter"}
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-destructive text-center text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
