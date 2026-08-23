"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

export function JoinLiveForm({ initialCode }: { initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Guards the QR-scan auto-join below so it only ever fires once per page load, not on every
  // re-render — the effect's own dependency (`code`) would otherwise re-trigger it if the user
  // edited the field after a failed attempt.
  const autoJoinedRef = useRef(false);

  const joinWithCode = useCallback(
    async (value: string) => {
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch(`/api/live/by-code/${value.trim()}`);
        if (!res.ok) {
          setError(
            await readErrorMessage(res, "No active game with that code."),
          );
          return;
        }
        const data = (await res.json()) as { sessionId: string };
        router.push(`/student/live/${data.sessionId}`);
      } finally {
        setSubmitting(false);
      }
    },
    [router],
  );

  // A code arriving via the host's QR link (features/live/live-host-view.tsx) means the student
  // already scanned to get here — joining automatically saves them re-typing what's already
  // filled in, matching how scanning a QR code to join normally behaves.
  useEffect(() => {
    if (!initialCode || autoJoinedRef.current) return;
    autoJoinedRef.current = true;
    void joinWithCode(initialCode);
  }, [initialCode, joinWithCode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await joinWithCode(code);
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
