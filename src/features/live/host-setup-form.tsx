"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ClassOption {
  id: string;
  name: string;
}

async function readErrorMessage(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? fallback;
}

export function HostSetupForm({
  quizId,
  quizTitle,
  classes,
}: {
  quizId: string;
  quizTitle: string;
  classes: ClassOption[];
}) {
  const router = useRouter();
  const [classId, setClassId] = useState("open");
  const [timeLimitSeconds, setTimeLimitSeconds] = useState("20");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleStart() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/quizzes/${quizId}/live`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(classId !== "open" ? { classId } : {}),
          timeLimitSeconds: Number(timeLimitSeconds),
        }),
      });
      if (!res.ok) {
        setError(await readErrorMessage(res, "Failed to start the game."));
        return;
      }
      const data = (await res.json()) as { session: { id: string } };
      router.push(`/teacher/live/${data.session.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-border bg-card mx-auto flex w-full max-w-md flex-col gap-5 rounded-2xl border p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
          <Radio className="size-6" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">Host a live game</h1>
        <p className="text-muted-foreground text-sm">
          {quizTitle} — students join with a code and answer together in real
          time.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="host-class">Who can join</Label>
        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger id="host-class">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Anyone with the code</SelectItem>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} only
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="host-time-limit">Time per question</Label>
        <Select value={timeLimitSeconds} onValueChange={setTimeLimitSeconds}>
          <SelectTrigger id="host-time-limit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10 seconds</SelectItem>
            <SelectItem value="20">20 seconds</SelectItem>
            <SelectItem value="30">30 seconds</SelectItem>
            <SelectItem value="60">60 seconds</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <Button onClick={handleStart} disabled={submitting} size="lg">
        {submitting ? "Starting…" : "Start Hosting"}
      </Button>
    </div>
  );
}
