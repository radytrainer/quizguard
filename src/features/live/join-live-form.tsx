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

export function JoinLiveForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
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
      router.push(`/student/live/${data.sessionId}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-primary/30 bg-primary/5 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
          <Radio className="size-5" />
        </div>
        <div>
          <p className="font-medium">Join a live game</p>
          <p className="text-muted-foreground text-sm">
            Enter the code your teacher shared.
          </p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          maxLength={6}
          inputMode="numeric"
          className="w-32 text-center font-mono text-lg tracking-widest"
          aria-label="Join code"
        />
        <Button type="submit" disabled={submitting || code.trim().length === 0}>
          {submitting ? "Joining…" : "Join"}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-destructive text-sm sm:basis-full">
          {error}
        </p>
      )}
    </div>
  );
}
