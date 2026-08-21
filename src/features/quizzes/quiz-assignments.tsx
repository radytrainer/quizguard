"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface AssignmentRow {
  id: string;
  classId: string | null;
  studentId: string | null;
  targetName: string;
  startAt: string | null;
  endAt: string | null;
}

interface ClassOption {
  id: string;
  name: string;
}

interface StudentOption {
  studentId: string;
  name: string;
  email: string;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function QuizAssignments({
  quizId,
  initialAssignments,
}: {
  quizId: string;
  initialAssignments: AssignmentRow[];
}) {
  const [assignments, setAssignments] =
    useState<AssignmentRow[]>(initialAssignments);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [target, setTarget] = useState<"class" | "student">("class");
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const debouncedStudentSearch = useDebouncedValue(studentSearch, 300);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      try {
        const res = await fetch("/api/classes?pageSize=100");
        if (!res.ok) return;
        const data = (await res.json()) as { items: ClassOption[] };
        if (!cancelled) setClasses(data.items);
      } catch {
        // Best-effort: an empty dropdown just means no classes to pick from yet.
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (target !== "student") return;
    let cancelled = false;
    void Promise.resolve().then(async () => {
      const params = new URLSearchParams();
      if (debouncedStudentSearch) params.set("search", debouncedStudentSearch);
      try {
        const res = await fetch(`/api/students?${params.toString()}`);
        if (!res.ok) return;
        const data = (await res.json()) as { students: StudentOption[] };
        if (!cancelled) setStudents(data.students);
      } catch {
        // Search is best-effort UI; a transient failure just leaves the list unchanged.
      }
    });
    return () => {
      cancelled = true;
    };
  }, [target, debouncedStudentSearch]);

  async function assignToClass() {
    if (!selectedClassId) return;
    await submitAssignment({ classId: selectedClassId });
  }

  async function assignToStudent(studentId: string) {
    await submitAssignment({ studentId });
  }

  async function submitAssignment(body: Record<string, string>) {
    setAssigning(true);
    setError(null);
    try {
      const res = await fetch(`/api/quizzes/${quizId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(errBody?.error?.message ?? "Failed to assign quiz.");
        return;
      }
      const listRes = await fetch(`/api/quizzes/${quizId}/assignments`);
      if (listRes.ok) {
        const data = (await listRes.json()) as { assignments: AssignmentRow[] };
        setAssignments(data.assignments);
      }
      setSelectedClassId("");
    } finally {
      setAssigning(false);
    }
  }

  async function removeAssignment(assignmentId: string) {
    setPendingId(assignmentId);
    setError(null);
    try {
      const res = await fetch(
        `/api/quizzes/${quizId}/assignments/${assignmentId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? "Failed to remove assignment.");
        return;
      }
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
    } finally {
      setPendingId(null);
    }
  }

  const assignedClassIds = new Set(
    assignments.filter((a) => a.classId).map((a) => a.classId),
  );
  const assignedStudentIds = new Set(
    assignments.filter((a) => a.studentId).map((a) => a.studentId),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Assignments ({assignments.length})
        </CardTitle>
        <CardDescription>
          Assign this quiz to a whole class or to individual students. Only
          published quizzes can be assigned.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {assignments.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Not assigned to anyone yet.
          </p>
        )}
        {assignments.map((assignment) => (
          <div
            key={assignment.id}
            className="border-outline-variant flex items-center gap-2 rounded-lg border p-3"
          >
            <Badge variant="outline">
              {assignment.classId ? "Class" : "Student"}
            </Badge>
            <p className="flex-1 truncate text-sm">{assignment.targetName}</p>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={pendingId === assignment.id}
              onClick={() => removeAssignment(assignment.id)}
              aria-label="Remove assignment"
            >
              <X className="text-destructive size-4" />
            </Button>
          </div>
        ))}

        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        <div className="border-outline-variant flex flex-col gap-3 border-t pt-4">
          <Select
            value={target}
            onValueChange={(v) => setTarget(v as "class" | "student")}
          >
            <SelectTrigger className="w-[180px]" aria-label="Assignment target">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="class">Assign to a class</SelectItem>
              <SelectItem value="student">Assign to a student</SelectItem>
            </SelectContent>
          </Select>

          {target === "class" && (
            <div className="flex items-center gap-2">
              <Select
                value={selectedClassId}
                onValueChange={setSelectedClassId}
              >
                <SelectTrigger className="flex-1" aria-label="Choose a class">
                  <SelectValue placeholder="Choose a class..." />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem
                      key={cls.id}
                      value={cls.id}
                      disabled={assignedClassIds.has(cls.id)}
                    >
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                disabled={!selectedClassId || assigning}
                onClick={assignToClass}
              >
                Assign
              </Button>
            </div>
          )}

          {target === "student" && (
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  placeholder="Search students..."
                  className="pl-9"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  aria-label="Search students"
                />
              </div>
              <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">
                {students.map((student) => {
                  const alreadyAssigned = assignedStudentIds.has(
                    student.studentId,
                  );
                  return (
                    <div
                      key={student.studentId}
                      className="border-outline-variant flex items-center gap-2 rounded-lg border p-2"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium">{student.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {student.email}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant={alreadyAssigned ? "ghost" : "outline"}
                        size="sm"
                        disabled={alreadyAssigned || assigning}
                        onClick={() => assignToStudent(student.studentId)}
                      >
                        {alreadyAssigned ? "Assigned" : "Assign"}
                      </Button>
                    </div>
                  );
                })}
                {students.length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    No matching students found.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
