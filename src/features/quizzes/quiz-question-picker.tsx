"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface PoolQuestion {
  id: string;
  type: string;
  subject: string;
  difficulty: string;
  points: number;
  text: string;
}

interface BankSearchItem {
  id: string;
  type: string;
  subject: string;
  difficulty: string;
  points: number;
  text: string;
}

interface BankListResponse {
  items: BankSearchItem[];
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

const PAGE_SIZE = 10;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function QuizQuestionPicker({
  quizId,
  initialPool,
}: {
  quizId: string;
  initialPool: PoolQuestion[];
}) {
  const [pool, setPool] = useState<PoolQuestion[]>(initialPool);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [subject, setSubject] = useState("all");
  const [category, setCategory] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);

  const [facets, setFacets] = useState<Facets>({
    subjects: [],
    categories: [],
  });
  const [result, setResult] = useState<BankListResponse | null>(null);
  const [bankSelected, setBankSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Mount-only: subject/category values change rarely enough that this doesn't need to
    // track filter state — the bank search itself always reflects live data regardless.
    fetch("/api/questions/facets")
      .then((res) => res.json())
      .then((data: Facets) => setFacets(data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (subject !== "all") params.set("subject", subject);
    if (category !== "all") params.set("category", category);
    if (difficulty !== "all") params.set("difficulty", difficulty);
    if (type !== "all") params.set("type", type);

    void Promise.resolve().then(async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/questions?${params.toString()}`);
        if (!res.ok) return;
        const data = (await res.json()) as BankListResponse;
        if (!cancelled) setResult(data);
      } catch {
        // Search is best-effort UI; a transient failure just leaves the list unchanged.
      }
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, subject, category, difficulty, type, page]);

  // A filter/search/page change swaps the visible bank list out from under any bulk selection
  // made against it — clear it so "Add selected" can't silently add rows the teacher no longer
  // sees. Bundled into each handler below (not a separate effect) to avoid a synchronous
  // setState-in-effect.
  function updateFilter<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
      setBankSelected(new Set());
    };
  }

  const handleSubjectChange = updateFilter(setSubject);
  const handleCategoryChange = updateFilter(setCategory);
  const handleDifficultyChange = updateFilter(setDifficulty);
  const handleTypeChange = updateFilter(setType);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
    setBankSelected(new Set());
  }

  function goToPage(next: number) {
    setPage(next);
    setBankSelected(new Set());
  }

  const hasActiveFilters =
    search ||
    subject !== "all" ||
    category !== "all" ||
    difficulty !== "all" ||
    type !== "all";

  function clearFilters() {
    setSearch("");
    setSubject("all");
    setCategory("all");
    setDifficulty("all");
    setType("all");
    setPage(1);
    setBankSelected(new Set());
  }

  const pooledIds = new Set(pool.map((q) => q.id));
  const totalPoints = pool.reduce((sum, q) => sum + q.points, 0);

  function addToPool(question: BankSearchItem) {
    if (pooledIds.has(question.id)) return;
    setPool((prev) => [...prev, question]);
    setSaved(false);
  }

  function addSelectedToPool() {
    const toAdd = (result?.items ?? []).filter(
      (q) => bankSelected.has(q.id) && !pooledIds.has(q.id),
    );
    if (toAdd.length === 0) return;
    setPool((prev) => [...prev, ...toAdd]);
    setBankSelected(new Set());
    setSaved(false);
  }

  function toggleBankSelected(id: string) {
    setBankSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function removeFromPool(id: string) {
    setPool((prev) => prev.filter((q) => q.id !== id));
    setSaved(false);
  }

  function clearPool() {
    if (pool.length === 0) return;
    if (!confirm(`Remove all ${pool.length} questions from the pool?`)) return;
    setPool([]);
    setSaved(false);
  }

  function move(index: number, direction: -1 | 1) {
    setPool((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);

    const res = await fetch(`/api/quizzes/${quizId}/questions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionIds: pool.map((q) => q.id) }),
    });

    setSaving(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setSaveError(body?.error?.message ?? "Failed to save question pool.");
      return;
    }
    setSaved(true);
  }

  const totalPages = result
    ? Math.max(1, Math.ceil(result.total / PAGE_SIZE))
    : 1;
  const selectableCount = (result?.items ?? []).filter(
    (q) => !pooledIds.has(q.id),
  ).length;
  const allSelectableSelected =
    selectableCount > 0 &&
    (result?.items ?? [])
      .filter((q) => !pooledIds.has(q.id))
      .every((q) => bankSelected.has(q.id));

  function toggleSelectAllOnPage() {
    const selectableIds = (result?.items ?? [])
      .filter((q) => !pooledIds.has(q.id))
      .map((q) => q.id);
    setBankSelected((prev) => {
      if (allSelectableSelected) {
        const next = new Set(prev);
        for (const id of selectableIds) next.delete(id);
        return next;
      }
      return new Set([...prev, ...selectableIds]);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Question Pool ({pool.length})
          </CardTitle>
          <CardDescription>
            Questions available to this quiz
            {pool.length > 0 && ` — ${totalPoints} points total`}. When
            randomization is on, attempts draw a random subset from this pool.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {pool.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No questions yet — add some from the bank on the right.
            </p>
          )}
          <div className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto">
            {pool.map((question, index) => (
              <div
                key={question.id}
                className="border-border flex items-start gap-2 rounded-lg border p-3"
              >
                <div className="flex flex-col">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label="Move up"
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={index === pool.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label="Move down"
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <p className="text-sm">{question.text}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{question.subject}</Badge>
                    <Badge
                      variant="outline"
                      className={DIFFICULTY_STYLES[question.difficulty]}
                    >
                      {question.difficulty}
                    </Badge>
                    <Badge variant="outline">{question.points} pt</Badge>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeFromPool(question.id)}
                  aria-label="Remove from pool"
                >
                  <X className="text-destructive size-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save Pool"}
            </Button>
            {pool.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearPool}
              >
                Clear pool
              </Button>
            )}
            {saved && <span className="text-success text-sm">Pool saved.</span>}
            {saveError && (
              <span className="text-destructive text-sm">{saveError}</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Question Bank</CardTitle>
          <CardDescription>
            Search and filter to find questions, then add them to the pool.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              placeholder="Search questions..."
              className="pl-9"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              aria-label="Search question bank"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={subject} onValueChange={handleSubjectChange}>
              <SelectTrigger
                className="w-[130px]"
                aria-label="Filter by subject"
              >
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
              <SelectTrigger
                className="w-[130px]"
                aria-label="Filter by category"
              >
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
                className="w-[110px]"
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
              <SelectTrigger className="w-[140px]" aria-label="Filter by type">
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

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>

          {result && result.items.length > 0 && (
            <div className="flex items-center justify-between gap-2">
              <label className="text-muted-foreground flex items-center gap-2 text-xs">
                <Checkbox
                  checked={allSelectableSelected}
                  onCheckedChange={toggleSelectAllOnPage}
                  disabled={selectableCount === 0}
                  aria-label="Select all on this page"
                />
                Select all on this page
              </label>
              {bankSelected.size > 0 && (
                <Button type="button" size="sm" onClick={addSelectedToPool}>
                  <Plus className="size-4" />
                  Add {bankSelected.size} selected
                </Button>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {result?.items.map((question) => {
              const alreadyPooled = pooledIds.has(question.id);
              return (
                <div
                  key={question.id}
                  className="border-border flex items-center gap-2 rounded-lg border p-3"
                >
                  <Checkbox
                    checked={bankSelected.has(question.id)}
                    onCheckedChange={() => toggleBankSelected(question.id)}
                    disabled={alreadyPooled}
                    aria-label={`Select ${question.text}`}
                  />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <p className="text-sm">{question.text}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{question.subject}</Badge>
                      <Badge
                        variant="outline"
                        className={DIFFICULTY_STYLES[question.difficulty]}
                      >
                        {question.difficulty}
                      </Badge>
                      <Badge variant="outline">
                        {TYPE_LABELS[question.type] ?? question.type}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant={alreadyPooled ? "ghost" : "outline"}
                    size="icon-sm"
                    disabled={alreadyPooled}
                    onClick={() => addToPool(question)}
                    aria-label="Add to pool"
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              );
            })}
            {result && result.items.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No questions found.
              </p>
            )}
          </div>

          {result && result.total > 0 && (
            <div className="text-muted-foreground flex items-center justify-between text-xs">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}-
                {Math.min(page * PAGE_SIZE, result.total)} of {result.total}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => goToPage(page - 1)}
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
                  onClick={() => goToPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
