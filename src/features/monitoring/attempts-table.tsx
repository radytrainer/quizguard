"use client";

import { useMemo, useState } from "react";
import { Lock, Search } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { LOCKED_BADGE_CLASSNAME } from "@/features/monitoring/event-colors";
import type { LiveAttempt } from "@/features/monitoring/live-monitor";

const STATUS_LABELS: Record<string, string> = {
  in_progress: "In progress",
  submitted: "Submitted",
  auto_submitted: "Auto-submitted",
};

// Matches the severity buckets the summary strip counts by — 0 flags reads as clean, 1-2 is
// worth a glance, 3+ is worth acting on. A fixed heuristic, not configurable: simple enough
// that a teacher doesn't need to think about what the numbers mean before using it.
function flagBadgeClassName(count: number): string {
  if (count === 0) return "";
  if (count <= 2) return "border-warning/30 bg-warning/10 text-warning";
  return "";
}

type Filter = "all" | "in_progress" | "flagged" | "locked" | "submitted";

export function AttemptsTable({
  quizId,
  attempts,
  onUnlock,
}: {
  quizId: string;
  attempts: LiveAttempt[];
  onUnlock: (attemptId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [unlocking, setUnlocking] = useState<string | null>(null);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return attempts
      .filter((a) => {
        if (query && !a.studentName.toLowerCase().includes(query)) return false;
        if (filter === "in_progress") return a.status === "in_progress";
        if (filter === "flagged") return a.violationCount > 0;
        if (filter === "locked") return a.locked;
        if (filter === "submitted") return a.status !== "in_progress";
        return true;
      })
      .sort((a, b) => {
        // Locked attempts need a teacher's attention above all else, then most-flagged, then
        // most recently started.
        if (a.locked !== b.locked) return a.locked ? -1 : 1;
        if (b.violationCount !== a.violationCount) {
          return b.violationCount - a.violationCount;
        }
        return b.startedAt.getTime() - a.startedAt.getTime();
      });
  }, [attempts, search, filter]);

  async function handleUnlockClick(attemptId: string) {
    setUnlocking(attemptId);
    try {
      await Promise.resolve(onUnlock(attemptId));
    } finally {
      setUnlocking(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">All ({attempts.length})</TabsTrigger>
            <TabsTrigger value="in_progress">
              In progress (
              {attempts.filter((a) => a.status === "in_progress").length})
            </TabsTrigger>
            <TabsTrigger value="flagged">
              Flagged ({attempts.filter((a) => a.violationCount > 0).length})
            </TabsTrigger>
            <TabsTrigger value="locked">
              Locked ({attempts.filter((a) => a.locked).length})
            </TabsTrigger>
            <TabsTrigger value="submitted">
              Submitted (
              {attempts.filter((a) => a.status !== "in_progress").length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search students..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search students"
          />
        </div>
      </div>

      <div className="bg-card border-outline-variant overflow-hidden rounded-xl border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Attempt</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead className="text-right">Started</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground py-8 text-center"
                >
                  {attempts.length === 0
                    ? "No attempts yet."
                    : "No attempts match this filter."}
                </TableCell>
              </TableRow>
            )}
            {visible.map((attempt) => (
              <TableRow key={attempt.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/teacher/quizzes/${quizId}/attempts/${attempt.id}`}
                    className="hover:underline"
                  >
                    {attempt.studentName}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {attempt.attemptNumber ?? "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline">
                      {STATUS_LABELS[attempt.status]}
                    </Badge>
                    {attempt.locked && (
                      <Badge
                        variant="outline"
                        className={cn("gap-1", LOCKED_BADGE_CLASSNAME)}
                      >
                        <Lock className="size-3" />
                        Locked
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {attempt.score === null
                    ? "—"
                    : `${attempt.score} / ${attempt.maxScore}`}
                </TableCell>
                <TableCell>
                  {attempt.violationCount > 0 ? (
                    <Badge
                      variant={
                        attempt.violationCount > 2 ? "destructive" : "outline"
                      }
                      className={flagBadgeClassName(attempt.violationCount)}
                    >
                      {attempt.violationCount}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-right text-sm">
                  {attempt.startedAt.toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  {attempt.locked && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={unlocking === attempt.id}
                      onClick={() => void handleUnlockClick(attempt.id)}
                    >
                      {unlocking === attempt.id ? "Unlocking…" : "Unlock"}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
