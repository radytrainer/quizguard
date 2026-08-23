"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Flag,
  Lock,
  Maximize2,
  Minimize2,
  Printer,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AttemptsTable } from "@/features/monitoring/attempts-table";
import {
  LOCKED_BADGE_CLASSNAME,
  STARTED_BADGE_CLASSNAME,
  VIOLATION_BADGE_CLASSNAME,
  outcomeBadgeClassName,
} from "@/features/monitoring/event-colors";
import { StudentStoryDialog } from "@/features/monitoring/student-story-dialog";
import { getRealtimeSocket } from "@/features/realtime/socket-client";

// Mirrors backend/monitoring/monitoring.service.ts's AttemptSummary — duplicated (not
// imported) because that module lives under backend/ and pulls in "server-only", which this
// client component can't import. `attemptNumber` is optional here specifically because a row
// added live from an `attempt_started` event (Section below) doesn't carry one — the event
// schema (backend/realtime/realtime-event.schema.ts) never included it.
export interface LiveAttempt {
  id: string;
  studentId: string;
  studentName: string;
  // Optional for the same reason as `attemptNumber` above — a row added live from an
  // `attempt_started` event doesn't carry it, since the event schema never included it either.
  studentEmail?: string;
  status: "in_progress" | "submitted" | "auto_submitted";
  attemptNumber?: number;
  startedAt: Date;
  submittedAt: Date | null;
  score: number | null;
  maxScore: number | null;
  passed: boolean | null;
  violationCount: number;
  locked: boolean;
}

interface PresenceEntry {
  attemptId: string;
  studentId: string;
  studentName: string;
}

// Covers both a live socket push and a row of persisted history (features/monitoring's
// `initialEvents` prop, sourced from monitoring.service.ts's `getActivityHistory`) — the two
// are normalized to this exact shape so one render path (below) handles either origin.
interface LiveEvent {
  type:
    | "attempt_started"
    | "attempt_submitted"
    | "violation"
    | "attempt_locked"
    | "attempt_unlocked";
  attemptId: string;
  studentId: string;
  studentName: string;
  occurredAt: string;
  status?: "submitted" | "auto_submitted";
  score?: number | null;
  maxScore?: number | null;
  passed?: boolean | null;
  violationType?: "fullscreen_exit" | "tab_switch" | "copy_paste";
  locked?: boolean;
}

// The verb phrase shown next to the (separately colored) student name badge — kept apart from
// the name so the badge coloring in `eventBadgeClassName` below doesn't have to be recomputed
// from a rendered string.
function eventVerb(event: LiveEvent): string {
  if (event.type === "attempt_started") return "started the quiz";
  if (event.type === "attempt_locked") return "exam locked";
  if (event.type === "attempt_unlocked") return "was unlocked";
  if (event.type === "attempt_submitted") {
    const outcome =
      event.passed === null ? "" : event.passed ? " — passed" : " — not passed";
    return `submitted${outcome}`;
  }
  const labels: Record<string, string> = {
    fullscreen_exit: "exited fullscreen",
    tab_switch: "switched tabs",
    copy_paste: "copy/cut",
  };
  const verb = labels[event.violationType ?? ""] ?? "flagged";
  // Live violation events carry `locked` inline (recorded and locked in the same instant);
  // historical ones get their own separate `attempt_locked` row instead (see above) — either
  // way the feed reads the same.
  return event.locked ? `${verb} — exam locked` : verb;
}

// Colors the student-name badge by what just happened — shared palette with
// student-story-dialog.tsx (event-colors.ts) so the same event type always reads the same
// color everywhere it shows up.
function eventBadgeClassName(event: LiveEvent): string {
  if (event.type === "attempt_started") return STARTED_BADGE_CLASSNAME;
  if (event.type === "attempt_unlocked") return STARTED_BADGE_CLASSNAME;
  if (event.type === "attempt_locked") return LOCKED_BADGE_CLASSNAME;
  if (event.type === "attempt_submitted")
    return outcomeBadgeClassName(event.passed ?? null);
  if (event.locked) return LOCKED_BADGE_CLASSNAME;
  return (
    VIOLATION_BADGE_CLASSNAME[event.violationType ?? "tab_switch"] ??
    VIOLATION_BADGE_CLASSNAME.tab_switch
  );
}

// 0 flags = clean, 1-2 = worth a glance, 3+ = worth acting on now — the same heuristic
// attempts-table.tsx's badge coloring uses, kept in sync so the summary strip's counts match
// what the "Flagged" filter/badge colors actually mean.
function severity(count: number): "normal" | "warning" | "flagged" {
  if (count === 0) return "normal";
  if (count <= 2) return "warning";
  return "flagged";
}

// Matches monitoring.service.ts's `getActivityHistory` cap — retaining fewer than that here
// would make a freshly loaded page's history immediately start dropping rows a live push would
// otherwise have kept.
const MAX_EVENTS = 200;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// "8:00 AM" input[type=time] values arrive as "08:00" — converted to minutes-since-midnight so
// the export filter can compare purely on time-of-day, ignoring which day each event fell on.
function parseTimeToMinutes(value: string): number | null {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

// `Date#toISOString` reports UTC, which would shift an event's date across midnight in most
// local time zones — this builds the same "YYYY-MM-DD" input[type=date] uses, but from local
// fields, so a date the export filter compares against actually matches the day the event
// happened in the browser's own time zone.
function toLocalDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function LiveMonitor({
  quizId,
  quizTitle,
  initialAttempts,
  initialEvents,
}: {
  quizId: string;
  quizTitle: string;
  initialAttempts: LiveAttempt[];
  initialEvents: LiveEvent[];
}) {
  const [present, setPresent] = useState<PresenceEntry[]>([]);
  const [presentSearch, setPresentSearch] = useState("");
  const [events, setEvents] = useState<LiveEvent[]>(initialEvents);
  const [eventSearch, setEventSearch] = useState("");
  const [attempts, setAttempts] = useState<LiveAttempt[]>(initialAttempts);
  const [storyAttemptId, setStoryAttemptId] = useState<string | null>(null);
  const [activityQuizName, setActivityQuizName] = useState(quizTitle);
  const [activityDate, setActivityDate] = useState("");
  const [activityFrom, setActivityFrom] = useState("");
  const [activityTo, setActivityTo] = useState("");

  const liveViewRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === liveViewRef.current);
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    if (!liveViewRef.current) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await liveViewRef.current.requestFullscreen();
      }
    } catch {
      // Fullscreen can be denied (no user gesture, disabled by policy, etc.) — the toggle
      // button just stays available to try again.
    }
  }

  useEffect(() => {
    const socket = getRealtimeSocket();

    function join() {
      socket.emit("join:quiz", quizId);
    }
    function handleSnapshot(entries: PresenceEntry[]) {
      setPresent(entries);
    }
    function handleEvent(event: LiveEvent) {
      setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));

      setAttempts((prev) => {
        const index = prev.findIndex((a) => a.id === event.attemptId);

        if (event.type === "violation") {
          if (index === -1) return prev;
          const next = [...prev];
          next[index] = {
            ...next[index],
            violationCount: next[index].violationCount + 1,
            locked: event.locked ? true : next[index].locked,
          };
          return next;
        }

        if (event.type === "attempt_unlocked") {
          if (index === -1) return prev;
          const next = [...prev];
          next[index] = { ...next[index], locked: false };
          return next;
        }

        if (event.type === "attempt_submitted") {
          if (index === -1) return prev;
          const next = [...prev];
          next[index] = {
            ...next[index],
            status: event.status ?? next[index].status,
            score: event.score ?? next[index].score,
            maxScore: event.maxScore ?? next[index].maxScore,
            passed: event.passed ?? next[index].passed,
            submittedAt: new Date(event.occurredAt),
          };
          return next;
        }

        // attempt_started: only add a new row if this attempt wasn't already known (a resumed
        // in-progress attempt re-announces itself on reconnect, which shouldn't duplicate it).
        if (index !== -1) return prev;
        const added: LiveAttempt = {
          id: event.attemptId,
          studentId: event.studentId,
          studentName: event.studentName,
          status: "in_progress",
          startedAt: new Date(event.occurredAt),
          submittedAt: null,
          score: null,
          maxScore: null,
          passed: null,
          violationCount: 0,
          locked: false,
        };
        return [added, ...prev];
      });
    }

    if (socket.connected) join();
    socket.on("connect", join);
    socket.on("presence:snapshot", handleSnapshot);
    socket.on("presence:update", handleSnapshot);
    socket.on("event", handleEvent);

    return () => {
      socket.off("connect", join);
      socket.off("presence:snapshot", handleSnapshot);
      socket.off("presence:update", handleSnapshot);
      socket.off("event", handleEvent);
    };
  }, [quizId]);

  const counts = useMemo(() => {
    const result = { normal: 0, warning: 0, flagged: 0 };
    for (const attempt of attempts) {
      result[severity(attempt.violationCount)] += 1;
    }
    return result;
  }, [attempts]);
  const lockedCount = useMemo(
    () => attempts.filter((a) => a.locked).length,
    [attempts],
  );
  const visiblePresent = useMemo(() => {
    const query = presentSearch.trim().toLowerCase();
    if (!query) return present;
    return present.filter((entry) =>
      entry.studentName.toLowerCase().includes(query),
    );
  }, [present, presentSearch]);
  const visibleEvents = useMemo(() => {
    const query = eventSearch.trim().toLowerCase();
    if (!query) return events;
    return events.filter((event) =>
      event.studentName.toLowerCase().includes(query),
    );
  }, [events, eventSearch]);
  // Keyed by attemptId so both the presence chips and the activity feed can show each event's
  // attempt number / lock state without the socket payloads (PresenceEntry, LiveEvent) needing
  // to carry that data themselves — `attempts` already tracks it reactively.
  const attemptsById = useMemo(() => {
    return new Map(attempts.map((attempt) => [attempt.id, attempt]));
  }, [attempts]);

  // Shared by the attempts table's row action and the story dialog's own unlock button, so both
  // stay in sync with a single source of truth (`attempts`) instead of each independently
  // refetching. The realtime `attempt_unlocked` event (handled above) also keeps other
  // connected teachers' views in sync with this one.
  async function handleUnlock(attemptId: string) {
    const res = await fetch(
      `/api/quizzes/${quizId}/attempts/${attemptId}/unlock`,
      { method: "POST" },
    );
    if (!res.ok) return;
    setAttempts((prev) =>
      prev.map((a) => (a.id === attemptId ? { ...a, locked: false } : a)),
    );
  }

  // Opens a print-ready report in a new tab and hands it straight to the browser's print
  // dialog — "Save as PDF" there produces the exam-period document without this app needing a
  // PDF-rendering dependency of its own. Filters purely on time-of-day (not date), matching how
  // a teacher thinks about an exam window ("8:00 AM – 10:00 AM") regardless of which day it ran.
  function handleExportActivityPdf() {
    const fromMinutes = parseTimeToMinutes(activityFrom);
    const toMinutes = parseTimeToMinutes(activityTo);
    const reportTitle = activityQuizName.trim() || quizTitle;

    const inRange = events.filter((event) => {
      const occurred = new Date(event.occurredAt);
      if (activityDate && toLocalDateInputValue(occurred) !== activityDate) {
        return false;
      }
      if (fromMinutes === null && toMinutes === null) return true;
      const minutes = occurred.getHours() * 60 + occurred.getMinutes();
      if (fromMinutes !== null && minutes < fromMinutes) return false;
      if (toMinutes !== null && minutes > toMinutes) return false;
      return true;
    });
    const sorted = [...inRange].sort(
      (a, b) =>
        new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );

    const dateLabel = activityDate
      ? new Date(`${activityDate}T00:00:00`).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : null;
    const timeLabel =
      fromMinutes === null && toMinutes === null
        ? null
        : `${activityFrom || "start"} – ${activityTo || "end"}`;
    const rangeLabel =
      [dateLabel, timeLabel].filter(Boolean).join(" · ") || "All activity";

    const rows = sorted
      .map(
        (event) => `<tr>
          <td>${escapeHtml(new Date(event.occurredAt).toLocaleString())}</td>
          <td>${escapeHtml(event.studentName)}</td>
          <td>${escapeHtml(eventVerb(event))}</td>
        </tr>`,
      )
      .join("");

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(reportTitle)} — Activity Report</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; margin: 2.5rem; }
  h1 { font-size: 1.4rem; margin: 0 0 0.2rem; }
  .meta { color: #555; font-size: 0.85rem; margin-bottom: 1.5rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #f2f2f2; }
  tr:nth-child(even) { background: #fafafa; }
  @media print { body { margin: 1.2cm; } }
</style>
</head>
<body>
  <h1>${escapeHtml(reportTitle)}</h1>
  <p class="meta">
    Live Activity Report &middot; Range: ${escapeHtml(rangeLabel)} &middot;
    Generated ${escapeHtml(new Date().toLocaleString())} &middot;
    ${sorted.length} event${sorted.length === 1 ? "" : "s"}
  </p>
  <table>
    <thead><tr><th>Time</th><th>Student</th><th>Event</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="3">No activity in this range.</td></tr>`}</tbody>
  </table>
</body>
</html>`;

    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      alert("Allow pop-ups for this site to export the activity report.");
      return;
    }
    reportWindow.document.write(html);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Card>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="text-muted-foreground text-sm">Active now</p>
              <p className="text-3xl font-bold tracking-tight">
                {present.length}
              </p>
            </div>
            <Users className="text-muted-foreground size-5" />
          </CardContent>
        </Card>
        <Card className={lockedCount > 0 ? "border-destructive/30" : ""}>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="text-muted-foreground text-sm">Locked</p>
              <p className="text-destructive text-3xl font-bold tracking-tight">
                {lockedCount}
              </p>
            </div>
            <Lock className="text-destructive size-5" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="text-muted-foreground text-sm">Normal</p>
              <p className="text-3xl font-bold tracking-tight">
                {counts.normal}
              </p>
            </div>
            <Activity className="text-success size-5" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="text-muted-foreground text-sm">Warning</p>
              <p className="text-warning text-3xl font-bold tracking-tight">
                {counts.warning}
              </p>
            </div>
            <ShieldAlert className="text-warning size-5" />
          </CardContent>
        </Card>
        <Card className={counts.flagged > 0 ? "border-destructive/30" : ""}>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="text-muted-foreground text-sm">Flagged</p>
              <p className="text-destructive text-3xl font-bold tracking-tight">
                {counts.flagged}
              </p>
            </div>
            <Flag className="text-destructive size-5" />
          </CardContent>
        </Card>
      </div>

      <div
        ref={liveViewRef}
        className={cn(
          "flex flex-col gap-3",
          isFullscreen &&
            "bg-background fixed inset-0 z-50 overflow-y-auto p-6",
        )}
      >
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm font-medium">Live view</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void toggleFullscreen()}
          >
            {isFullscreen ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
            {isFullscreen ? "Exit full screen" : "Full screen"}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Currently taking ({present.length})
              </CardTitle>
              <CardDescription>
                Live — updates as students connect. Click a student to see their
                story.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {present.length > 5 && (
                <div className="relative mb-1">
                  <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                  <Input
                    placeholder="Find a student…"
                    className="h-8 pl-9 text-sm"
                    value={presentSearch}
                    onChange={(e) => setPresentSearch(e.target.value)}
                    aria-label="Search students currently taking the quiz"
                  />
                </div>
              )}
              {present.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  No one is currently taking this quiz.
                </p>
              )}
              {present.length > 0 && visiblePresent.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  No students match &quot;{presentSearch}&quot;.
                </p>
              )}
              <div
                className={cn(
                  "flex flex-wrap gap-1.5 overflow-x-hidden overflow-y-auto",
                  isFullscreen ? "max-h-[70vh]" : "max-h-72",
                )}
              >
                {visiblePresent.map((entry) => {
                  const attempt = attemptsById.get(entry.attemptId);
                  const locked = attempt?.locked ?? false;
                  return (
                    <button
                      key={entry.attemptId}
                      type="button"
                      onClick={() => setStoryAttemptId(entry.attemptId)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-left text-xs transition-colors",
                        locked
                          ? LOCKED_BADGE_CLASSNAME
                          : "border-border hover:bg-secondary/50",
                      )}
                    >
                      {locked ? (
                        <Lock className="size-3 shrink-0" />
                      ) : (
                        <span className="bg-success inline-block size-1.5 shrink-0 rounded-full" />
                      )}
                      <span>{entry.studentName}</span>
                      {attempt?.attemptNumber !== undefined && (
                        <span
                          className={cn(
                            "text-[10px]",
                            locked ? "opacity-80" : "text-muted-foreground",
                          )}
                        >
                          #{attempt.attemptNumber}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Live activity</CardTitle>
              <CardDescription>
                Full history for this exam — starts, submissions, and flagged
                activity — updating live as things happen.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex min-w-40 flex-1 flex-col gap-1">
                  <label
                    htmlFor="activity-export-quiz"
                    className="text-muted-foreground text-[10px]"
                  >
                    Quiz name
                  </label>
                  <Input
                    id="activity-export-quiz"
                    className="h-8 text-sm"
                    value={activityQuizName}
                    onChange={(e) => setActivityQuizName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="activity-export-date"
                    className="text-muted-foreground text-[10px]"
                  >
                    Date
                  </label>
                  <Input
                    id="activity-export-date"
                    type="date"
                    className="h-8 w-40 text-sm"
                    value={activityDate}
                    onChange={(e) => setActivityDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="activity-export-from"
                    className="text-muted-foreground text-[10px]"
                  >
                    From
                  </label>
                  <Input
                    id="activity-export-from"
                    type="time"
                    className="h-8 w-36 text-sm"
                    value={activityFrom}
                    onChange={(e) => setActivityFrom(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="activity-export-to"
                    className="text-muted-foreground text-[10px]"
                  >
                    To
                  </label>
                  <Input
                    id="activity-export-to"
                    type="time"
                    className="h-8 w-36 text-sm"
                    value={activityTo}
                    onChange={(e) => setActivityTo(e.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={handleExportActivityPdf}
                >
                  <Printer className="size-4" />
                  Export PDF
                </Button>
              </div>
              {events.length > 5 && (
                <div className="relative mb-1">
                  <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                  <Input
                    placeholder="Find a student…"
                    className="h-8 pl-9 text-sm"
                    value={eventSearch}
                    onChange={(e) => setEventSearch(e.target.value)}
                    aria-label="Search activity by student"
                  />
                </div>
              )}
              {events.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  Nothing has happened for this exam yet.
                </p>
              )}
              {events.length > 0 && visibleEvents.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  No activity matches &quot;{eventSearch}&quot;.
                </p>
              )}
              <div
                className={cn(
                  "flex flex-col gap-2 overflow-x-hidden overflow-y-auto",
                  isFullscreen ? "max-h-[70vh]" : "max-h-80",
                )}
              >
                {visibleEvents.map((event, index) => {
                  const attempt = attemptsById.get(event.attemptId);
                  return (
                    <button
                      key={`${event.attemptId}-${event.occurredAt}-${index}`}
                      type="button"
                      onClick={() => setStoryAttemptId(event.attemptId)}
                      className="hover:bg-secondary/50 -mx-1 flex items-center gap-2 rounded-md px-1 py-1 text-left text-sm transition-colors"
                    >
                      <Badge
                        variant="outline"
                        className={cn("shrink-0", eventBadgeClassName(event))}
                      >
                        {event.studentName}
                      </Badge>
                      {isFullscreen && attempt?.attemptNumber !== undefined && (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground shrink-0 text-[10px]"
                        >
                          Attempt #{attempt.attemptNumber}
                        </Badge>
                      )}
                      <span className="text-muted-foreground min-w-0 flex-1 truncate">
                        {eventVerb(event)}
                      </span>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {isFullscreen
                          ? new Date(event.occurredAt).toLocaleString()
                          : new Date(event.occurredAt).toLocaleTimeString()}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <AttemptsTable
        quizId={quizId}
        attempts={attempts}
        onUnlock={handleUnlock}
      />

      <StudentStoryDialog
        quizId={quizId}
        attemptId={storyAttemptId}
        onOpenChange={(open) => {
          if (!open) setStoryAttemptId(null);
        }}
        onUnlock={handleUnlock}
      />
    </div>
  );
}
