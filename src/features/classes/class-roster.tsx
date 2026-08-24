"use client";

import { useEffect, useState } from "react";
import {
  FileUp,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImportStudentsDialog } from "@/features/classes/import-students-dialog";

type Gender = "male" | "female" | "other";

async function readErrorMessage(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? fallback;
}

export interface RosterMember {
  studentId: string;
  name: string;
  email: string;
  studentNumber: string | null;
  gender: Gender | null;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function ClassRoster({
  classId,
  initialRoster,
}: {
  classId: string;
  initialRoster: RosterMember[];
}) {
  const [roster, setRoster] = useState<RosterMember[]>(initialRoster);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [available, setAvailable] = useState<RosterMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<RosterMember | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      try {
        const res = await fetch(
          `/api/classes/${classId}/available-students?${params.toString()}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { students: RosterMember[] };
        if (!cancelled) setAvailable(data.students);
      } catch {
        // Search is best-effort UI; a transient failure just leaves the list unchanged.
      }
    });
    return () => {
      cancelled = true;
    };
  }, [classId, debouncedSearch, roster.length]);

  async function addStudent(student: RosterMember) {
    setPendingId(student.studentId);
    setError(null);
    try {
      const res = await fetch(`/api/classes/${classId}/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.studentId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? "Failed to add student.");
        return;
      }
      const data = (await res.json()) as { roster: RosterMember[] };
      setRoster(data.roster);
    } finally {
      setPendingId(null);
    }
  }

  async function removeStudent(studentId: string) {
    setPendingId(studentId);
    setError(null);
    try {
      const res = await fetch(`/api/classes/${classId}/students/${studentId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? "Failed to remove student.");
        return;
      }
      setRoster((prev) => prev.filter((s) => s.studentId !== studentId));
    } finally {
      setPendingId(null);
    }
  }

  async function deleteStudent(student: RosterMember) {
    if (
      !confirm(
        `Permanently delete ${student.name}'s account? This removes them from every class, not just this one, and cannot be undone.`,
      )
    )
      return;
    setPendingId(student.studentId);
    setError(null);
    try {
      const res = await fetch(`/api/students/${student.studentId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError(await readErrorMessage(res, "Failed to delete student."));
        return;
      }
      setRoster((prev) =>
        prev.filter((s) => s.studentId !== student.studentId),
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Roster ({roster.length})</CardTitle>
          <CardDescription>Students currently enrolled.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {roster.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No students yet — add some from the right.
            </p>
          )}
          {roster.map((student) => (
            <div
              key={student.studentId}
              className="border-outline-variant flex items-center gap-2 rounded-lg border p-3"
            >
              <div className="flex-1">
                <p className="text-sm font-medium">{student.name}</p>
                <p className="text-muted-foreground text-xs">{student.email}</p>
              </div>
              {student.studentNumber && (
                <Badge variant="outline">{student.studentNumber}</Badge>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={pendingId === student.studentId}
                    aria-label="Student actions"
                  >
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditingStudent(student)}>
                    <Pencil />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => removeStudent(student.studentId)}
                  >
                    <X />
                    Remove from roster
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => deleteStudent(student)}
                  >
                    <Trash2 />
                    Delete account
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add students</CardTitle>
          <CardDescription>Search active student accounts.</CardDescription>
          <CardAction className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setImportOpen(true)}
            >
              <FileUp className="size-4" />
              Import Excel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCreateOpen(true)}
            >
              <UserPlus className="size-4" />
              New student
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              placeholder="Search students..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search students"
            />
          </div>
          <div className="flex flex-col gap-2">
            {available.map((student) => (
              <div
                key={student.studentId}
                className="border-outline-variant flex items-center gap-2 rounded-lg border p-3"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium">{student.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {student.email}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  disabled={pendingId === student.studentId}
                  onClick={() => addStudent(student)}
                  aria-label="Add to roster"
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            ))}
            {available.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No matching students found.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <CreateStudentDialog
        classId={classId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(nextRoster) => {
          setRoster(nextRoster);
          setCreateOpen(false);
        }}
      />

      <ImportStudentsDialog
        classId={classId}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(nextRoster) => setRoster(nextRoster)}
      />

      <EditStudentDialog
        student={editingStudent}
        onOpenChange={(open) => {
          if (!open) setEditingStudent(null);
        }}
        onUpdated={(updated) => {
          setRoster((prev) =>
            prev.map((s) => (s.studentId === updated.studentId ? updated : s)),
          );
          setEditingStudent(null);
        }}
      />
    </div>
  );
}

function CreateStudentDialog({
  classId,
  open,
  onOpenChange,
  onCreated,
}: {
  classId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (roster: RosterMember[]) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [gender, setGender] = useState<Gender>("male");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setName("");
    setEmail("");
    setPassword("");
    setGender("male");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/classes/${classId}/students/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, gender }),
      });
      if (!res.ok) {
        setError(await readErrorMessage(res, "Failed to create student."));
        return;
      }
      const data = (await res.json()) as { roster: RosterMember[] };
      reset();
      onCreated(data.roster);
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
            <DialogTitle>New student</DialogTitle>
            <DialogDescription>
              Creates a student account and enrolls it in this class
              immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="student-name">Name</Label>
            <Input
              id="student-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="student-email">Email</Label>
            <Input
              id="student-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="student-password">Password</Label>
            <Input
              id="student-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="student-gender">Gender</Label>
            <Select
              value={gender}
              onValueChange={(v) => setGender(v as Gender)}
            >
              <SelectTrigger id="student-gender">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create & enroll"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Split from the dialog shell so `key={student.studentId}` (below) can force a fresh mount —
// and therefore fresh initial state — whenever a different row's edit is opened, instead of
// syncing state to a changing prop via an effect (react-hooks/set-state-in-effect).
function EditStudentForm({
  student,
  onOpenChange,
  onUpdated,
}: {
  student: RosterMember;
  onOpenChange: (open: boolean) => void;
  onUpdated: (student: RosterMember) => void;
}) {
  const [name, setName] = useState(student.name);
  const [studentNumber, setStudentNumber] = useState(
    student.studentNumber ?? "",
  );
  const [gender, setGender] = useState<Gender>(student.gender ?? "male");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/students/${student.studentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, studentNumber, gender }),
      });
      if (!res.ok) {
        setError(await readErrorMessage(res, "Failed to update student."));
        return;
      }
      onOpenChange(false);
      onUpdated({
        ...student,
        name,
        studentNumber: studentNumber ? studentNumber : null,
        gender,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Edit student</DialogTitle>
          <DialogDescription>
            Updates this student&apos;s roster profile. Their email and password
            stay the same.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-student-name">Name</Label>
          <Input
            id="edit-student-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-student-number">Student number</Label>
          <Input
            id="edit-student-number"
            value={studentNumber}
            onChange={(e) => setStudentNumber(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-student-gender">Gender</Label>
          <Select value={gender} onValueChange={(v) => setGender(v as Gender)}>
            <SelectTrigger id="edit-student-gender">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function EditStudentDialog({
  student,
  onOpenChange,
  onUpdated,
}: {
  student: RosterMember | null;
  onOpenChange: (open: boolean) => void;
  onUpdated: (student: RosterMember) => void;
}) {
  return (
    <Dialog open={student !== null} onOpenChange={onOpenChange}>
      {student && (
        <EditStudentForm
          key={student.studentId}
          student={student}
          onOpenChange={onOpenChange}
          onUpdated={onUpdated}
        />
      )}
    </Dialog>
  );
}
