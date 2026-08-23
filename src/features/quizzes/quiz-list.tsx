"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Archive,
  BarChart3,
  CalendarClock,
  Clock,
  Copy,
  FileEdit,
  ListChecks,
  MoreHorizontal,
  Plus,
  Radio,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type DisplayStatus = "draft" | "published" | "scheduled" | "archived";

interface QuizListItem {
  id: string;
  title: string;
  subject: string;
  status: "draft" | "published" | "archived";
  displayStatus: DisplayStatus;
  durationMinutes: number;
  questionsPerAttempt: number;
  questionCount: number;
  studentCount: number;
  joinedCount: number;
  startAt: string | null;
  endAt: string | null;
}

interface ListResponse {
  items: QuizListItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface ClassOption {
  id: string;
  name: string;
}

const STATUS_BADGE_STYLES: Record<DisplayStatus, string> = {
  draft: "border-outline-variant bg-muted text-muted-foreground",
  published: "border-success/30 bg-success/10 text-success",
  scheduled: "border-warning/30 bg-warning/10 text-warning",
  archived: "border-outline-variant bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<DisplayStatus, string> = {
  draft: "Draft",
  published: "Published",
  scheduled: "Scheduled",
  archived: "Archived",
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function StatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <Badge variant="outline" className={STATUS_BADGE_STYLES[status]}>
      {status === "published" && (
        <span className="bg-success mr-0.5 inline-block size-1.5 rounded-full" />
      )}
      {status === "draft" && <FileEdit className="size-3" />}
      {status === "scheduled" && <CalendarClock className="size-3" />}
      {status === "archived" && <Archive className="size-3" />}
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface Availability {
  label: string;
  tone: "live" | "closed";
}

// Only meaningful once a quiz is actually published — "scheduled" already
// means it isn't open to students yet, so there's nothing more to say there.
function getAvailability(quiz: QuizListItem): Availability | null {
  if (quiz.displayStatus !== "published") return null;
  const endAt = quiz.endAt ? new Date(quiz.endAt).getTime() : null;
  if (endAt !== null && endAt < Date.now()) {
    return { label: "Closed to new attempts", tone: "closed" };
  }
  return { label: "Live — students can join now", tone: "live" };
}

function StatItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-2 py-2.5 text-center">
      <Icon className="text-muted-foreground size-3.5" />
      <p className="font-mono text-sm leading-none font-semibold">{value}</p>
      <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
        {label}
      </p>
    </div>
  );
}

export function QuizList() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [subject, setSubject] = useState("all");
  const [classId, setClassId] = useState("all");
  const [status, setStatus] = useState("all");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const [subjects, setSubjects] = useState<string[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [result, setResult] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    // Mount-only, same reasoning as features/questions/question-list.tsx: filter option
    // lists change rarely enough that they don't need to track the quiz list's own state.
    fetch("/api/quizzes/facets")
      .then((res) => res.json())
      .then((data: { subjects: string[] }) => setSubjects(data.subjects))
      .catch(() => undefined);
    fetch("/api/classes?pageSize=100")
      .then((res) => res.json())
      .then((data: { items: ClassOption[] }) => setClasses(data.items))
      .catch(() => undefined);
  }, []);

  function refetch() {
    let cancelled = false;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (subject !== "all") params.set("subject", subject);
    if (classId !== "all") params.set("classId", classId);
    if (status !== "all") params.set("status", status);
    if (date) params.set("date", date);

    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/quizzes?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load quizzes");
        const data = (await res.json()) as ListResponse;
        if (!cancelled) setResult(data);
      } catch {
        if (!cancelled) setError("Couldn't load quizzes. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }

  useEffect(refetch, [debouncedSearch, subject, classId, status, date, page]);

  function updateFilter<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  const handleSearchChange = updateFilter(setSearch);
  const handleSubjectChange = updateFilter(setSubject);
  const handleClassChange = updateFilter(setClassId);
  const handleStatusChange = updateFilter(setStatus);
  const handleDateChange = updateFilter(setDate);

  const filtersActive =
    search ||
    subject !== "all" ||
    classId !== "all" ||
    status !== "all" ||
    date !== "";

  function clearFilters() {
    setSearch("");
    setSubject("all");
    setClassId("all");
    setStatus("all");
    setDate("");
    setPage(1);
  }

  async function callApi(url: string, method: string, actionLabel: string) {
    setActionError(null);
    const res = await fetch(url, { method });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setActionError(body?.error?.message ?? `Failed to ${actionLabel} quiz.`);
      return;
    }
    refetch();
  }

  function handleAction(id: string, action: string) {
    return callApi(`/api/quizzes/${id}/${action}`, "POST", action);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this quiz? This cannot be undone.")) return;
    await callApi(`/api/quizzes/${id}`, "DELETE", "delete");
  }

  const totalPages = result
    ? Math.max(1, Math.ceil(result.total / pageSize))
    : 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quizzes</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage and monitor all your course assessments.
          </p>
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/teacher/quizzes/new">
            <Plus className="size-4" />
            Create Quiz
          </Link>
        </Button>
      </div>

      <div className="bg-card border-outline-variant rounded-lg border p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Filters</p>
          {filtersActive && (
            <Button variant="link" size="sm" onClick={clearFilters}>
              Clear All
            </Button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="relative w-full md:w-64">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              placeholder="Search quizzes..."
              className="pl-9"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              aria-label="Search quizzes"
            />
          </div>
          <Select value={subject} onValueChange={handleSubjectChange}>
            <SelectTrigger className="w-[160px]" aria-label="Filter by subject">
              <SelectValue placeholder="Subject" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Subject (All)</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={classId} onValueChange={handleClassChange}>
            <SelectTrigger className="w-[160px]" aria-label="Filter by class">
              <SelectValue placeholder="Class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Class (All)</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[150px]" aria-label="Filter by status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Status (All)</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            className="w-[170px]"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            aria-label="Filter by start date"
          />
        </div>
      </div>

      {actionError && (
        <p role="alert" className="text-destructive text-sm">
          {actionError}
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {!error && !loading && result?.items.length === 0 && (
        <p className="text-muted-foreground py-8 text-center text-sm">
          No quizzes found.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {result?.items.map((quiz) => (
          <Card key={quiz.id} className="flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between">
              <StatusBadge status={quiz.displayStatus} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`More actions for ${quiz.title}`}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {quiz.displayStatus === "draft" && (
                    <DropdownMenuItem
                      onClick={() => handleAction(quiz.id, "publish")}
                    >
                      Publish
                    </DropdownMenuItem>
                  )}
                  {(quiz.displayStatus === "scheduled" ||
                    quiz.displayStatus === "published") && (
                    <DropdownMenuItem asChild>
                      <Link href={`/teacher/quizzes/${quiz.id}/edit`}>
                        <FileEdit />
                        Edit
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {quiz.displayStatus === "published" && (
                    <DropdownMenuItem
                      onClick={() => handleAction(quiz.id, "unpublish")}
                    >
                      Unpublish
                    </DropdownMenuItem>
                  )}
                  {quiz.status !== "archived" && (
                    <DropdownMenuItem
                      onClick={() => handleAction(quiz.id, "archive")}
                    >
                      <Archive />
                      Archive
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => handleAction(quiz.id, "duplicate")}
                  >
                    <Copy />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => handleDelete(quiz.id)}
                  >
                    <Trash2 />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div>
              <Link
                href={`/teacher/quizzes/${quiz.id}/preview`}
                className="font-semibold hover:underline"
              >
                {quiz.title}
              </Link>
              <p className="text-muted-foreground text-sm">
                Subject: {quiz.subject}
              </p>
            </div>

            {(() => {
              const availability = getAvailability(quiz);
              const hasSchedule = quiz.startAt || quiz.endAt;
              if (!availability && !hasSchedule) return null;
              return (
                <div className="flex flex-col gap-1.5">
                  {hasSchedule && (
                    <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <CalendarClock className="size-3.5 shrink-0" />
                      <span>
                        {quiz.startAt && (
                          <>Starts {formatDateTime(quiz.startAt)}</>
                        )}
                        {quiz.startAt && quiz.endAt && " · "}
                        {quiz.endAt && <>Ends {formatDateTime(quiz.endAt)}</>}
                      </span>
                    </div>
                  )}
                  {availability && (
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      <span
                        className={cn(
                          "inline-block size-1.5 rounded-full",
                          availability.tone === "live"
                            ? "bg-success animate-pulse"
                            : "bg-muted-foreground",
                        )}
                      />
                      <span
                        className={
                          availability.tone === "live"
                            ? "text-success"
                            : "text-muted-foreground"
                        }
                      >
                        {availability.label}
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="bg-muted/40 divide-outline-variant grid grid-cols-3 divide-x rounded-lg">
              <StatItem
                icon={ListChecks}
                label="Questions"
                value={`${quiz.questionsPerAttempt}/${quiz.questionCount}`}
              />
              <StatItem
                icon={Clock}
                label="Duration"
                value={`${quiz.durationMinutes} min`}
              />
              <StatItem
                icon={Users}
                label="Joined"
                value={`${quiz.joinedCount}/${quiz.studentCount}`}
              />
            </div>

            <div className="border-outline-variant flex flex-col gap-2 border-t pt-4">
              {quiz.displayStatus === "draft" && (
                <Button
                  size="sm"
                  className="w-full"
                  variant="secondary"
                  asChild
                >
                  <Link href={`/teacher/quizzes/${quiz.id}/edit`}>
                    <FileEdit className="size-3.5" />
                    Continue Editing
                  </Link>
                </Button>
              )}
              {quiz.displayStatus === "published" && (
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" asChild>
                    <Link
                      href={`/teacher/quizzes/${quiz.id}/preview#assignments`}
                    >
                      <UserPlus className="size-3.5" />
                      Assign
                    </Link>
                  </Button>
                  <Button size="sm" variant="secondary" asChild>
                    <Link href={`/teacher/quizzes/${quiz.id}/host`}>
                      <Radio className="size-3.5" />
                      Host Live
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/teacher/quizzes/${quiz.id}/attempts`}>
                      <ListChecks className="size-3.5" />
                      Attempts
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/teacher/quizzes/${quiz.id}/results`}>
                      <BarChart3 className="size-3.5" />
                      Results
                    </Link>
                  </Button>
                </div>
              )}
              {quiz.displayStatus === "scheduled" && (
                <>
                  <Button size="sm" className="w-full" asChild>
                    <Link
                      href={`/teacher/quizzes/${quiz.id}/preview#assignments`}
                    >
                      <UserPlus className="size-3.5" />
                      Assign to Students
                    </Link>
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="secondary" asChild>
                      <Link href={`/teacher/quizzes/${quiz.id}/edit`}>
                        Edit
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction(quiz.id, "unpublish")}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}
              {quiz.displayStatus === "archived" && (
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="secondary" asChild>
                    <Link href={`/teacher/quizzes/${quiz.id}/preview`}>
                      View
                    </Link>
                  </Button>
                  <Button size="sm" variant="secondary" asChild>
                    <Link href={`/teacher/quizzes/${quiz.id}/attempts`}>
                      Attempts
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {result && result.total > 0 && (
        <div className="text-muted-foreground flex flex-col items-center gap-2 text-xs sm:flex-row sm:justify-between">
          <span>
            Showing {(page - 1) * pageSize + 1}-
            {Math.min(page * pageSize, result.total)} of {result.total} quizzes
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span>
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
