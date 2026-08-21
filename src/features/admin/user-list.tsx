"use client";

import { useEffect, useState } from "react";
import { KeyRound, Plus, Search } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type Role = "admin" | "teacher" | "student";
type Status = "active" | "disabled";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: Status;
  createdAt: string;
}

interface ListResponse {
  items: UserRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface ErrorBody {
  error?: { message?: string; fields?: Record<string, string[]> };
}

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student",
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

async function readErrorMessage(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as ErrorBody | null;
  return body?.error?.message ?? fallback;
}

function ResetPasswordDialog({
  user,
  onClose,
  onDone,
}: {
  user: UserRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${user.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError(await readErrorMessage(res, "Failed to reset password."));
        return;
      }
      setPassword("");
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={user !== null}
      onOpenChange={(next) => {
        if (!next) {
          setPassword("");
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for {user?.name}. They&apos;ll need to use it
              on their next sign-in.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reset-password">New password</Label>
            <Input
              id="reset-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Reset password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UserList() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [role, setRole] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [result, setResult] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [resettingUser, setResettingUser] = useState<UserRow | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (role !== "all") params.set("role", role);

    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/users?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load users");
        const data = (await res.json()) as ListResponse;
        if (!cancelled) setResult(data);
      } catch {
        if (!cancelled) setError("Couldn't load users. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, role, page, refreshKey]);

  function refetch() {
    setRefreshKey((k) => k + 1);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleRoleChange(value: string) {
    setRole(value);
    setPage(1);
  }

  async function toggleStatus(user: UserRow) {
    setActionError(null);
    const nextStatus: Status = user.status === "active" ? "disabled" : "active";
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!res.ok) {
      setActionError(await readErrorMessage(res, "Failed to update user."));
      return;
    }
    refetch();
  }

  async function handleDelete(user: UserRow) {
    if (!confirm(`Delete ${user.name}'s account? This cannot be undone.`)) {
      return;
    }
    setActionError(null);
    const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
    if (!res.ok) {
      setActionError(await readErrorMessage(res, "Failed to delete user."));
      return;
    }
    refetch();
  }

  const totalPages = result
    ? Math.max(1, Math.ceil(result.total / pageSize))
    : 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Create and manage admin, teacher, and student accounts.
          </p>
        </div>
        <CreateUserButton onCreated={refetch} />
      </div>

      <div className="bg-card border-outline-variant flex flex-wrap items-center gap-3 rounded-lg border p-4 shadow-sm">
        <div className="relative w-full md:w-72">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search by name or email..."
            className="pl-9"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            aria-label="Search users"
          />
        </div>
        <Select value={role} onValueChange={handleRoleChange}>
          <SelectTrigger className="w-[150px]" aria-label="Filter by role">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="teacher">Teacher</SelectItem>
            <SelectItem value="student">Student</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {actionError && (
        <p role="alert" className="text-destructive text-sm">
          {actionError}
        </p>
      )}

      <div className="bg-card border-outline-variant overflow-hidden rounded-xl border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-destructive py-8 text-center"
                >
                  {error}
                </TableCell>
              </TableRow>
            )}
            {!error && !loading && result?.items.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground py-8 text-center"
                >
                  No users found.
                </TableCell>
              </TableRow>
            )}
            {!error &&
              result?.items.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{ROLE_LABELS[user.role]}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        user.status === "active"
                          ? "border-success/30 bg-success/10 text-success"
                          : "border-outline-variant bg-muted text-muted-foreground"
                      }
                    >
                      {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setResettingUser(user)}
                      >
                        <KeyRound className="size-4" />
                        Reset password
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleStatus(user)}
                      >
                        {user.status === "active" ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleDelete(user)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>

        {result && result.total > 0 && (
          <div className="border-outline-variant text-muted-foreground flex items-center justify-between border-t px-6 py-3 text-xs">
            <span>
              Showing {(page - 1) * pageSize + 1}-
              {Math.min(page * pageSize, result.total)} of {result.total} users
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

      <ResetPasswordDialog
        user={resettingUser}
        onClose={() => setResettingUser(null)}
        onDone={() => setResettingUser(null)}
      />
    </div>
  );
}

function CreateUserButton({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Create account
      </Button>
      <CreateUserDialogControlled
        open={open}
        onOpenChange={setOpen}
        onCreated={() => {
          setOpen(false);
          onCreated();
        }}
      />
    </>
  );
}

function CreateUserDialogControlled({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [studentNumber, setStudentNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setEmail("");
    setName("");
    setPassword("");
    setRole("student");
    setStudentNumber("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          password,
          role,
          ...(role === "student" && studentNumber ? { studentNumber } : {}),
        }),
      });
      if (!res.ok) {
        setError(await readErrorMessage(res, "Failed to create user."));
        return;
      }
      reset();
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Create account</DialogTitle>
            <DialogDescription>
              The account is active immediately with the password you set here.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="user-name">Name</Label>
            <Input
              id="user-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="user-email">Email</Label>
            <Input
              id="user-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="user-password">Password</Label>
            <Input
              id="user-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="user-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger id="user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="teacher">Teacher</SelectItem>
                <SelectItem value="student">Student</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {role === "student" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="user-student-number">
                Student number (optional)
              </Label>
              <Input
                id="user-student-number"
                value={studentNumber}
                onChange={(e) => setStudentNumber(e.target.value)}
              />
            </div>
          )}

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
