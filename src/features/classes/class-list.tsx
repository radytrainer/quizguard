"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ClassRow {
  id: string;
  name: string;
  studentCount: number;
}

interface ListResponse {
  items: ClassRow[];
  total: number;
  page: number;
  pageSize: number;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function CreateClassDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? "Failed to create class.");
        return;
      }
      setName("");
      setOpen(false);
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Create Class
      </Button>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Create class</DialogTitle>
            <DialogDescription>
              You can add students to the roster afterward.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="class-name">Name</Label>
            <Input
              id="class-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create class"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ClassList() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [result, setResult] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (debouncedSearch) params.set("search", debouncedSearch);

    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/classes?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load classes");
        const data = (await res.json()) as ListResponse;
        if (!cancelled) setResult(data);
      } catch {
        if (!cancelled) setError("Couldn't load classes. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, page, refreshKey]);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  const totalPages = result
    ? Math.max(1, Math.ceil(result.total / pageSize))
    : 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Classes</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage class rosters and assign quizzes to them.
          </p>
        </div>
        <CreateClassDialog onCreated={() => setRefreshKey((k) => k + 1)} />
      </div>

      <div className="bg-card border-outline-variant flex flex-wrap items-center gap-3 rounded-lg border p-4 shadow-sm">
        <div className="relative w-full md:w-72">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search classes..."
            className="pl-9"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            aria-label="Search classes"
          />
        </div>
      </div>

      <div className="bg-card border-outline-variant overflow-hidden rounded-xl border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Students</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error && (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-destructive py-8 text-center"
                >
                  {error}
                </TableCell>
              </TableRow>
            )}
            {!error && !loading && result?.items.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-muted-foreground py-8 text-center"
                >
                  No classes found.
                </TableCell>
              </TableRow>
            )}
            {!error &&
              result?.items.map((cls) => (
                <TableRow key={cls.id}>
                  <TableCell className="font-medium">{cls.name}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {cls.studentCount}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/teacher/classes/${cls.id}`}>
                        Manage roster
                      </Link>
                    </Button>
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
              classes
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
    </div>
  );
}
