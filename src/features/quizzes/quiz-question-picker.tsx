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
import { Input } from "@/components/ui/input";

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
  const [results, setResults] = useState<BankSearchItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      const params = new URLSearchParams({ pageSize: "20" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      try {
        const res = await fetch(`/api/questions?${params.toString()}`);
        if (!res.ok) return;
        const data = (await res.json()) as { items: BankSearchItem[] };
        if (!cancelled) setResults(data.items);
      } catch {
        // Search is best-effort UI; a transient failure just leaves the list unchanged.
      }
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  const pooledIds = new Set(pool.map((q) => q.id));

  function addToPool(question: BankSearchItem) {
    if (pooledIds.has(question.id)) return;
    setPool((prev) => [...prev, question]);
    setSaved(false);
  }

  function removeFromPool(id: string) {
    setPool((prev) => prev.filter((q) => q.id !== id));
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

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Question Pool ({pool.length})
          </CardTitle>
          <CardDescription>
            Questions available to this quiz. When randomization is on, attempts
            draw a random subset from this pool.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {pool.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No questions yet — add some from the bank on the right.
            </p>
          )}
          {pool.map((question, index) => (
            <div
              key={question.id}
              className="border-outline-variant flex items-center gap-2 rounded-lg border p-3"
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
              <p className="flex-1 truncate text-sm">{question.text}</p>
              <Badge variant="outline">{question.points} pt</Badge>
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

          <div className="mt-2 flex items-center gap-3">
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save Pool"}
            </Button>
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
          <CardDescription>Search and add questions.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              placeholder="Search questions..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search question bank"
            />
          </div>
          <div className="flex flex-col gap-2">
            {results.map((question) => {
              const alreadyPooled = pooledIds.has(question.id);
              return (
                <div
                  key={question.id}
                  className="border-outline-variant flex items-center gap-2 rounded-lg border p-3"
                >
                  <p className="flex-1 truncate text-sm">{question.text}</p>
                  <Badge variant="outline">{question.subject}</Badge>
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
            {results.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No questions found.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
