"use client";

import { useMemo, useState } from "react";
import { Download, Lock, Search } from "lucide-react";
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

const PAGE_SIZE = 15;

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
  const [page, setPage] = useState(1);
  const [unlocking, setUnlocking] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return attempts
      .filter((a) => {
        if (
          query &&
          !a.studentName.toLowerCase().includes(query) &&
          !(a.studentEmail?.toLowerCase().includes(query) ?? false)
        ) {
          return false;
        }
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

  // A page number only makes sense against the list it was computed for — reset to page 1
  // whenever a filter/search change swaps the filtered set out from under it. Done inline in
  // each handler (below) rather than an effect keyed on the same state, to avoid a synchronous
  // setState-in-effect (see react-hooks/set-state-in-effect).
  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleFilterChange(value: Filter) {
    setFilter(value);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const visible = filtered.slice(
    (clampedPage - 1) * PAGE_SIZE,
    clampedPage * PAGE_SIZE,
  );

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
      <div className="bg-card border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 shadow-sm">
        <Tabs
          value={filter}
          onValueChange={(v) => handleFilterChange(v as Filter)}
        >
          <TabsList className="flex-wrap">
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
        <div className="flex flex-1 items-center justify-end gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              placeholder="Search name or email..."
              className="pl-9"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              aria-label="Search students"
            />
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/quizzes/${quizId}/attempts/export`} download>
              <Download className="size-4" />
              Export
            </a>
          </Button>
        </div>
      </div>

      <div className="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
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
                    <div className="flex flex-col">
                      <span>{attempt.studentName}</span>
                      {attempt.studentEmail && (
                        <span className="text-muted-foreground text-xs font-normal">
                          {attempt.studentEmail}
                        </span>
                      )}
                    </div>
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

        {filtered.length > 0 && (
          <div className="border-border text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t px-6 py-3 text-xs">
            <span>
              Showing {(clampedPage - 1) * PAGE_SIZE + 1}-
              {Math.min(clampedPage * PAGE_SIZE, filtered.length)} of{" "}
              {filtered.length} attempt{filtered.length === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={clampedPage <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span>
                Page {clampedPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={clampedPage >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
