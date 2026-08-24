"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { quizInputSchema } from "@/backend/quizzes/quiz.schema";

interface FormState {
  title: string;
  description: string;
  subject: string;
  durationMinutes: number;
  passingScore: number;
  maxAttempts: number;
  startAt: string;
  endAt: string;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  fullscreenRequired: boolean;
  monitorActivity: boolean;
  autoSave: boolean;
  autoSubmit: boolean;
  showResults: boolean;
  questionsPerAttempt: number;
}

export interface QuizSettingsInitialData {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  durationMinutes: number;
  passingScore: number;
  maxAttempts: number;
  startAt: Date | null;
  endAt: Date | null;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  fullscreenRequired: boolean;
  monitorActivity: boolean;
  autoSave: boolean;
  autoSubmit: boolean;
  showResults: boolean;
  questionsPerAttempt: number;
}

function toDateTimeLocal(date: Date | null): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultState(initialData?: QuizSettingsInitialData): FormState {
  if (!initialData) {
    return {
      title: "",
      description: "",
      subject: "",
      durationMinutes: 60,
      passingScore: 70,
      maxAttempts: 1,
      startAt: "",
      endAt: "",
      randomizeQuestions: false,
      randomizeOptions: false,
      fullscreenRequired: false,
      monitorActivity: false,
      autoSave: true,
      autoSubmit: true,
      showResults: false,
      questionsPerAttempt: 10,
    };
  }
  return {
    title: initialData.title,
    description: initialData.description ?? "",
    subject: initialData.subject,
    durationMinutes: initialData.durationMinutes,
    passingScore: initialData.passingScore,
    maxAttempts: initialData.maxAttempts,
    startAt: toDateTimeLocal(initialData.startAt),
    endAt: toDateTimeLocal(initialData.endAt),
    randomizeQuestions: initialData.randomizeQuestions,
    randomizeOptions: initialData.randomizeOptions,
    fullscreenRequired: initialData.fullscreenRequired,
    monitorActivity: initialData.monitorActivity,
    autoSave: initialData.autoSave,
    autoSubmit: initialData.autoSubmit,
    showResults: initialData.showResults,
    questionsPerAttempt: initialData.questionsPerAttempt,
  };
}

function SettingToggle({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function QuizSettingsForm({
  initialData,
  onSaved,
}: {
  initialData?: QuizSettingsInitialData;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => defaultState(initialData));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    setSaved(false);

    const payload = {
      title: form.title,
      description: form.description || undefined,
      subject: form.subject,
      durationMinutes: form.durationMinutes,
      passingScore: form.passingScore,
      maxAttempts: form.maxAttempts,
      startAt: form.startAt || undefined,
      endAt: form.endAt || undefined,
      randomizeQuestions: form.randomizeQuestions,
      randomizeOptions: form.randomizeOptions,
      fullscreenRequired: form.fullscreenRequired,
      monitorActivity: form.monitorActivity,
      autoSave: form.autoSave,
      autoSubmit: form.autoSubmit,
      showResults: form.showResults,
      questionsPerAttempt: form.questionsPerAttempt,
    };

    const parsed = quizInputSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path.join(".") || "form"] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);

    const url = initialData ? `/api/quizzes/${initialData.id}` : "/api/quizzes";
    const method = initialData ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setSubmitError(body?.error?.message ?? "Failed to save quiz.");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);

    if (initialData) {
      setSaved(true);
      onSaved?.();
      router.refresh();
    } else {
      const { quiz } = (await res.json()) as { quiz: { id: string } };
      router.push(`/teacher/quizzes/${quiz.id}/edit`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              className="mt-1.5"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              aria-invalid={!!errors.title}
            />
            {errors.title && (
              <p className="text-destructive mt-1 text-sm">{errors.title}</p>
            )}
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              className="mt-1.5"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              className="mt-1.5"
              value={form.subject}
              onChange={(e) => set("subject", e.target.value)}
              placeholder="e.g. MySQL"
              aria-invalid={!!errors.subject}
            />
            {errors.subject && (
              <p className="text-destructive mt-1 text-sm">{errors.subject}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timing &amp; Attempts</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="durationMinutes">Duration (minutes)</Label>
            <Input
              id="durationMinutes"
              type="number"
              min={1}
              className="mt-1.5"
              value={form.durationMinutes}
              onChange={(e) =>
                set("durationMinutes", Number(e.target.value) || 1)
              }
              aria-invalid={!!errors.durationMinutes}
            />
          </div>
          <div>
            <Label htmlFor="passingScore">Passing score (%)</Label>
            <Input
              id="passingScore"
              type="number"
              min={0}
              max={100}
              className="mt-1.5"
              value={form.passingScore}
              onChange={(e) => set("passingScore", Number(e.target.value) || 0)}
              aria-invalid={!!errors.passingScore}
            />
          </div>
          <div>
            <Label htmlFor="maxAttempts">Max attempts</Label>
            <Input
              id="maxAttempts"
              type="number"
              min={1}
              className="mt-1.5"
              value={form.maxAttempts}
              onChange={(e) => set("maxAttempts", Number(e.target.value) || 1)}
            />
          </div>
          <div>
            <Label htmlFor="questionsPerAttempt">Questions per attempt</Label>
            <Input
              id="questionsPerAttempt"
              type="number"
              min={1}
              className="mt-1.5"
              value={form.questionsPerAttempt}
              onChange={(e) =>
                set("questionsPerAttempt", Number(e.target.value) || 1)
              }
              aria-invalid={!!errors.questionsPerAttempt}
            />
            {errors.questionsPerAttempt && (
              <p className="text-destructive mt-1 text-sm">
                {errors.questionsPerAttempt}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="startAt">Available from</Label>
            <Input
              id="startAt"
              type="datetime-local"
              className="mt-1.5"
              value={form.startAt}
              onChange={(e) => set("startAt", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="endAt">Available until</Label>
            <Input
              id="endAt"
              type="datetime-local"
              className="mt-1.5"
              value={form.endAt}
              onChange={(e) => set("endAt", e.target.value)}
              aria-invalid={!!errors.endAt}
            />
            {errors.endAt && (
              <p className="text-destructive mt-1 text-sm">{errors.endAt}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exam Mode</CardTitle>
          <CardDescription>
            Proctoring and anti-cheating controls for this quiz&apos;s timed,
            individually-taken exam attempts — shown to students as &quot;Exam
            Mode&quot; while they&apos;re taking it.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-outline-variant flex flex-col divide-y">
          <SettingToggle
            label="Require fullscreen"
            description="Student must enter fullscreen to start the exam, and it locks if they exit"
            checked={form.fullscreenRequired}
            onCheckedChange={(v) => set("fullscreenRequired", v)}
          />
          <SettingToggle
            label="Monitor activity"
            description="Record tab-switching, copy/paste, and fullscreen exits during the exam"
            checked={form.monitorActivity}
            onCheckedChange={(v) => set("monitorActivity", v)}
          />
          <SettingToggle
            label="Auto-submit at time limit"
            description="Submit automatically when the timer reaches zero"
            checked={form.autoSubmit}
            onCheckedChange={(v) => set("autoSubmit", v)}
          />
          <SettingToggle
            label="Randomize questions"
            description="Draw a random subset from the question pool per attempt"
            checked={form.randomizeQuestions}
            onCheckedChange={(v) => set("randomizeQuestions", v)}
          />
          <SettingToggle
            label="Randomize answer options"
            description="Shuffle option order per attempt"
            checked={form.randomizeOptions}
            onCheckedChange={(v) => set("randomizeOptions", v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">General</CardTitle>
        </CardHeader>
        <CardContent className="divide-outline-variant flex flex-col divide-y">
          <SettingToggle
            label="Auto-save answers"
            description="Periodically sync answers to the server while the exam is in progress"
            checked={form.autoSave}
            onCheckedChange={(v) => set("autoSave", v)}
          />
          <SettingToggle
            label="Release answers to students"
            description="Students always see their score; this additionally reveals which answers were correct. You can also toggle this later from the quiz's Results page."
            checked={form.showResults}
            onCheckedChange={(v) => set("showResults", v)}
          />
        </CardContent>
      </Card>

      {submitError && (
        <p role="alert" className="text-destructive text-sm">
          {submitError}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting
            ? "Saving…"
            : initialData
              ? "Save Settings"
              : "Create Quiz"}
        </Button>
        {saved && <span className="text-success text-sm">Settings saved.</span>}
      </div>
    </form>
  );
}
