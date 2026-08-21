"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface QuestionListItem {
  id: string;
  type: string;
  subject: string;
  category: string | null;
  difficulty: "easy" | "medium" | "hard";
  points: number;
  text: string;
  tags: string[];
}

interface ListResponse {
  items: QuestionListItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface Facets {
  subjects: string[];
  categories: string[];
}

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: "Multiple Choice",
  true_false: "True/False",
  multiple_answer: "Multiple Answer",
  short_answer: "Short Answer",
  fill_in_blank: "Fill in the Blank",
};

const DIFFICULTY_STYLES: Record<string, string> = {
  easy: "border-success/30 bg-success/10 text-success",
  medium: "border-warning/30 bg-warning/10 text-warning",
  hard: "border-destructive/30 bg-destructive/10 text-destructive",
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function QuestionList() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [subject, setSubject] = useState("all");
  const [category, setCategory] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [facets, setFacets] = useState<Facets>({
    subjects: [],
    categories: [],
  });
  const [result, setResult] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    // Mount-only: subject/category values change rarely enough that this doesn't need to
    // track filter state — the list itself always reflects live data regardless.
    fetch("/api/questions/facets")
      .then((res) => res.json())
      .then((data: Facets) => setFacets(data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (subject !== "all") params.set("subject", subject);
    if (category !== "all") params.set("category", category);
    if (difficulty !== "all") params.set("difficulty", difficulty);
    if (type !== "all") params.set("type", type);

    // Deferred a microtask so the loading/error resets happen after the effect's own
    // synchronous run, not during it (avoids the cascading-render footgun react-hooks warns
    // about for setState called directly in an effect body).
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/questions?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load questions");
        const data = (await res.json()) as ListResponse;
        if (!cancelled) setResult(data);
      } catch {
        if (!cancelled) {
          setError("Couldn't load questions. Please try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, subject, category, difficulty, type, page]);

  // A selection only makes sense against the list it was made on — clear it whenever a filter,
  // search, or page change swaps that list out from under it. Done inline in each handler
  // (below) rather than as an effect keyed on the same dependencies, so it's not a synchronous
  // setState-in-effect (see react-hooks/set-state-in-effect).
  function updateFilter<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
      setSelected(new Set());
    };
  }

  const handleSubjectChange = updateFilter(setSubject);
  const handleCategoryChange = updateFilter(setCategory);
  const handleDifficultyChange = updateFilter(setDifficulty);
  const handleTypeChange = updateFilter(setType);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
    setSelected(new Set());
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this question? This cannot be undone.")) return;

    const res = await fetch(`/api/questions/${id}`, { method: "DELETE" });
    if (res.ok) {
      setResult((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.filter((item) => item.id !== id),
              total: prev.total - 1,
            }
          : prev,
      );
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const visibleIds = result?.items.map((item) => item.id) ?? [];
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected = visibleIds.some((id) => selected.has(id));

  function toggleSelectAll() {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const id of visibleIds) next.delete(id);
        return next;
      }
      return new Set([...prev, ...visibleIds]);
    });
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (
      !confirm(
        `Delete ${selected.size} question${selected.size === 1 ? "" : "s"}? This cannot be undone.`,
      )
    ) {
      return;
    }

    setBulkDeleting(true);
    try {
      const res = await fetch("/api/questions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      if (res.ok) {
        const { deletedCount } = (await res.json()) as {
          deletedCount: number;
        };
        setResult((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.filter((item) => !selected.has(item.id)),
                total: prev.total - deletedCount,
              }
            : prev,
        );
        setSelected(new Set());
      }
    } finally {
      setBulkDeleting(false);
    }
  }

  const totalPages = result
    ? Math.max(1, Math.ceil(result.total / pageSize))
    : 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Question Bank</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage, categorize, and organize your assessment items.
          </p>
        </div>
        <Button asChild>
          <Link href="/teacher/questions/new">
            <Plus className="size-4" />
            Create Question
          </Link>
        </Button>
      </div>

      <div className="bg-card border-outline-variant flex flex-wrap items-center gap-3 rounded-lg border p-4 shadow-sm">
        <div className="relative w-full md:w-72">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search questions..."
            className="pl-9"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            aria-label="Search questions"
          />
        </div>

        <Select value={subject} onValueChange={handleSubjectChange}>
          <SelectTrigger className="w-[150px]" aria-label="Filter by subject">
            <SelectValue placeholder="Subject" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subjects</SelectItem>
            {facets.subjects.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={category} onValueChange={handleCategoryChange}>
          <SelectTrigger className="w-[150px]" aria-label="Filter by category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {facets.categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={difficulty} onValueChange={handleDifficultyChange}>
          <SelectTrigger
            className="w-[130px]"
            aria-label="Filter by difficulty"
          >
            <SelectValue placeholder="Difficulty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All difficulties</SelectItem>
            <SelectItem value="easy">Easy</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="hard">Hard</SelectItem>
          </SelectContent>
        </Select>

        <Select value={type} onValueChange={handleTypeChange}>
          <SelectTrigger className="w-[160px]" aria-label="Filter by type">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(search ||
          subject !== "all" ||
          category !== "all" ||
          difficulty !== "all" ||
          type !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setSubject("all");
              setCategory("all");
              setDifficulty("all");
              setType("all");
              setPage(1);
              setSelected(new Set());
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="border-primary/20 bg-primary/5 flex items-center justify-between rounded-lg border p-3">
          <p className="text-sm font-medium">
            {selected.size} question{selected.size === 1 ? "" : "s"} selected
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={bulkDeleting}
              onClick={() => void handleBulkDelete()}
            >
              <Trash2 className="size-4" />
              {bulkDeleting ? "Deleting…" : "Delete selected"}
            </Button>
          </div>
        </div>
      )}

      <div className="bg-card border-outline-variant overflow-hidden rounded-xl border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    allVisibleSelected
                      ? true
                      : someVisibleSelected
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={toggleSelectAll}
                  disabled={visibleIds.length === 0}
                  aria-label="Select all questions on this page"
                />
              </TableHead>
              <TableHead className="w-[35%]">Question</TableHead>
              <TableHead>Subject / Category</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Difficulty</TableHead>
              <TableHead>Points</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-destructive py-8 text-center"
                >
                  {error}
                </TableCell>
              </TableRow>
            )}
            {!error && !loading && result?.items.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground py-8 text-center"
                >
                  No questions found.
                </TableCell>
              </TableRow>
            )}
            {!error &&
              result?.items.map((item) => (
                <TableRow
                  key={item.id}
                  data-state={selected.has(item.id) ? "selected" : undefined}
                >
                  <TableCell>
                    <Checkbox
                      checked={selected.has(item.id)}
                      onCheckedChange={() => toggleSelected(item.id)}
                      aria-label={`Select ${item.text}`}
                    />
                  </TableCell>
                  <TableCell className="max-w-[400px] truncate">
                    {item.text}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{item.subject}</span>
                      {item.category && (
                        <span className="text-muted-foreground text-xs">
                          {item.category}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{TYPE_LABELS[item.type]}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={DIFFICULTY_STYLES[item.difficulty]}
                    >
                      {item.difficulty}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {item.points}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for ${item.text}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/teacher/questions/${item.id}/edit`}>
                            <Pencil />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => handleDelete(item.id)}
                        >
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>

        {result && result.total > 0 && (
          <div className="border-outline-variant text-muted-foreground flex items-center justify-between border-t px-6 py-3 text-xs">
            <span>
              Showing {(page - 1) * pageSize + 1}-
              {Math.min(page * pageSize, result.total)} of {result.total}{" "}
              questions
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => {
                  setPage((p) => p - 1);
                  setSelected(new Set());
                }}
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
                onClick={() => {
                  setPage((p) => p + 1);
                  setSelected(new Set());
                }}
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
