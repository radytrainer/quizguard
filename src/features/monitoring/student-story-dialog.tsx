"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Lock, LogIn, Send, ShieldAlert, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ViolationType } from "@/database/schema";
import {
  STARTED_BADGE_CLASSNAME,
  VIOLATION_BADGE_CLASSNAME,
  outcomeBadgeClassName,
} from "@/features/monitoring/event-colors";

interface AttemptDetail {
  studentName: string;
  status: "in_progress" | "submitted" | "auto_submitted";
  attemptNumber: number;
  score: number | null;
  maxScore: number | null;
  passed: boolean | null;
  startedAt: string;
  submittedAt: string | null;
  locked: boolean;
  violations: { id: string; type: ViolationType; occurredAt: string }[];
}

interface TimelineEntry {
  key: string;
  label: string;
  occurredAt: string;
  className: string;
  icon: typeof LogIn;
}

const STATUS_LABELS: Record<string, string> = {
  in_progress: "In progress",
  submitted: "Submitted",
  auto_submitted: "Auto-submitted",
};

const VIOLATION_LABELS: Record<ViolationType, string> = {
  fullscreen_exit: "Exited fullscreen",
  tab_switch: "Switched tabs / minimized",
  copy_paste: "Copy or cut",
};

function buildTimeline(detail: AttemptDetail): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      key: "started",
      label: "Started the quiz",
      occurredAt: detail.startedAt,
      className: STARTED_BADGE_CLASSNAME,
      icon: LogIn,
    },
    ...detail.violations.map((violation) => ({
      key: violation.id,
      label: VIOLATION_LABELS[violation.type],
      occurredAt: violation.occurredAt,
      className: VIOLATION_BADGE_CLASSNAME[violation.type],
      icon: violation.type === "copy_paste" ? Copy : ShieldAlert,
    })),
  ];

  if (detail.submittedAt) {
    entries.push({
      key: "submitted",
      label:
        detail.passed === null
          ? "Submitted"
          : detail.passed
            ? "Submitted — passed"
            : "Submitted — not passed",
      occurredAt: detail.submittedAt,
      className: outcomeBadgeClassName(detail.passed),
      icon: detail.passed === false ? XCircle : Send,
    });
  }

  return entries.sort(
    (a, b) =>
      new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );
}

/** A lightweight, in-place "story" of one student's attempt — separate from the full attempt
 * detail page (which also shows every answer) so a teacher can check on someone from the live
 * monitoring view without navigating away and losing their place. */
export function StudentStoryDialog({
  quizId,
  attemptId,
  onOpenChange,
  onUnlock,
}: {
  quizId: string;
  attemptId: string | null;
  onOpenChange: (open: boolean) => void;
  onUnlock: (attemptId: string) => void;
}) {
  const [detail, setDetail] = useState<AttemptDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      if (!attemptId) {
        setDetail(null);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/quizzes/${quizId}/attempts/${attemptId}`);
        if (!res.ok) return;
        const data = (await res.json()) as { attempt: AttemptDetail };
        if (!cancelled) setDetail(data.attempt);
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [quizId, attemptId]);

  const timeline = detail ? buildTimeline(detail) : [];

  async function handleUnlockClick() {
    if (!attemptId) return;
    setUnlocking(true);
    try {
      await Promise.resolve(onUnlock(attemptId));
      setDetail((prev) => (prev ? { ...prev, locked: false } : prev));
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <Dialog open={attemptId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{detail?.studentName ?? "Student activity"}</DialogTitle>
          <DialogDescription>
            {detail
              ? `Attempt ${detail.attemptNumber} · ${STATUS_LABELS[detail.status]}`
              : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {detail?.locked && (
          <div className="border-destructive/30 bg-destructive/5 flex items-center justify-between gap-3 rounded-lg border p-3">
            <p className="text-destructive flex items-center gap-1.5 text-sm">
              <Lock className="size-4" />
              Locked — exited fullscreen mid-exam
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={unlocking}
              onClick={() => void handleUnlockClick()}
            >
              {unlocking ? "Unlocking…" : "Unlock"}
            </Button>
          </div>
        )}

        {detail && (detail.score !== null || detail.passed !== null) && (
          <div className="flex items-center gap-2">
            {detail.score !== null && (
              <Badge variant="outline" className="font-mono">
                {detail.score} / {detail.maxScore}
              </Badge>
            )}
            {detail.passed !== null && (
              <Badge
                variant="outline"
                className={outcomeBadgeClassName(detail.passed)}
              >
                {detail.passed ? "Passed" : "Not passed"}
              </Badge>
            )}
          </div>
        )}

        <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
          {loading && <p className="text-muted-foreground text-sm">Loading…</p>}
          {!loading && timeline.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No activity recorded.
            </p>
          )}
          {timeline.map((entry) => {
            const Icon = entry.icon;
            return (
              <div key={entry.key} className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border",
                    entry.className,
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium">{entry.label}</p>
                  <p className="text-muted-foreground text-xs">
                    {new Date(entry.occurredAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {attemptId && (
          <DialogFooter>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/teacher/quizzes/${quizId}/attempts/${attemptId}`}>
                View full review
              </Link>
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
