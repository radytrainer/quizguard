"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { quizInputSchema } from "@/backend/quizzes/quiz.schema";
import type { QuizStatus } from "@/database/schema";
import {
  QuizQuestionPicker,
  type PoolQuestion,
} from "@/features/quizzes/quiz-question-picker";
import type { AssignmentRow } from "@/features/quizzes/quiz-assignments";
import { PublishStep } from "@/features/quizzes/wizard/publish-step";
import { ReviewStep } from "@/features/quizzes/wizard/review-step";
import {
  WIZARD_STEPS,
  initialWizardForm,
  toQuizPayload,
  type WizardFormState,
} from "@/features/quizzes/wizard/types";

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

export function QuizWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [furthestStep, setFurthestStep] = useState(1);
  const [form, setForm] = useState<WizardFormState>(initialWizardForm);
  const [quizId, setQuizId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pool, setPool] = useState<PoolQuestion[] | null>(null);
  const [publishData, setPublishData] = useState<{
    status: QuizStatus;
    assignments: AssignmentRow[];
  } | null>(null);

  function set<K extends keyof WizardFormState>(
    key: K,
    value: WizardFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Refetches the real saved pool every time the Questions step is entered — the picker only
  // reads its `initialPool` prop once (on mount), so this has to resolve *before* it renders,
  // or a revisit after already saving questions would render an empty pool and risk the
  // picker's own "Save Pool" button overwriting real data with nothing.
  useEffect(() => {
    if (step !== 2 || !quizId) return;
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setPool(null);
      try {
        const res = await fetch(`/api/quizzes/${quizId}/questions`);
        if (!res.ok) return;
        const data = (await res.json()) as { pool: PoolQuestion[] };
        if (!cancelled) setPool(data.pool);
      } catch {
        if (!cancelled) setPool([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [step, quizId]);

  // Same reasoning as the pool fetch above, for the Publish step's status/assignments —
  // PublishStep's initial props would otherwise go stale on a revisit (e.g. publish, go back
  // to Review, come forward again) since it only reads them once on mount.
  useEffect(() => {
    if (step !== 5 || !quizId) return;
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setPublishData(null);
      try {
        const [quizRes, assignmentsRes] = await Promise.all([
          fetch(`/api/quizzes/${quizId}`),
          fetch(`/api/quizzes/${quizId}/assignments`),
        ]);
        const quizData = quizRes.ok
          ? ((await quizRes.json()) as { quiz: { status: QuizStatus } })
          : null;
        const assignmentsData = assignmentsRes.ok
          ? ((await assignmentsRes.json()) as { assignments: AssignmentRow[] })
          : null;
        if (!cancelled) {
          setPublishData({
            status: quizData?.quiz.status ?? "draft",
            assignments: assignmentsData?.assignments ?? [],
          });
        }
      } catch {
        if (!cancelled) setPublishData({ status: "draft", assignments: [] });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [step, quizId]);

  function goToStep(target: number) {
    if (target <= furthestStep) setStep(target);
  }

  function advance(target: number) {
    setStep(target);
    setFurthestStep((prev) => Math.max(prev, target));
  }

  /** Details/Rules both save the same way — validate, then POST (first time) or PUT (every
   * subsequent save, including coming back from a later step to tweak something). Returns
   * whether it succeeded, so callers can decide whether to advance or just report the error. */
  async function persist(): Promise<boolean> {
    setSubmitError(null);
    const payload = toQuizPayload(form);
    const parsed = quizInputSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path.join(".") || "form"] = issue.message;
      }
      setErrors(fieldErrors);
      setSubmitError("Fix the highlighted fields before continuing.");
      return false;
    }
    setErrors({});
    setSaving(true);
    const url = quizId ? `/api/quizzes/${quizId}` : "/api/quizzes";
    const method = quizId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    setSaving(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setSubmitError(body?.error?.message ?? "Failed to save quiz.");
      return false;
    }
    if (!quizId) {
      const { quiz } = (await res.json()) as { quiz: { id: string } };
      setQuizId(quiz.id);
    }
    return true;
  }

  async function handleContinue() {
    if (step === 1 || step === 3) {
      const ok = await persist();
      if (!ok) return;
    }
    advance(Math.min(step + 1, WIZARD_STEPS.length));
  }

  async function handleSaveDraft() {
    if (step === 1 || step === 3) await persist();
    router.push(
      quizId ? `/teacher/quizzes/${quizId}/edit` : "/teacher/quizzes",
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild aria-label="Cancel">
            <Link href="/teacher/quizzes">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <h1 className="text-xl font-bold tracking-tight">Create New Quiz</h1>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="link"
            size="sm"
            onClick={() => void handleSaveDraft()}
          >
            Save Draft
          </Button>
          {(step === 1 || step === 3) && (
            <Button onClick={() => void handleContinue()} disabled={saving}>
              {saving ? "Saving…" : "Continue"}
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
        <Card className="h-fit">
          <CardContent className="pt-6">
            <p className="text-muted-foreground mb-4 text-xs font-semibold tracking-wide uppercase">
              Quiz Setup Progress
            </p>
            <div className="flex flex-col">
              {WIZARD_STEPS.map((s, index) => {
                const isCurrent = s.step === step;
                const isDone = s.step < furthestStep;
                const isReachable = s.step <= furthestStep;
                return (
                  <button
                    key={s.step}
                    type="button"
                    disabled={!isReachable}
                    onClick={() => goToStep(s.step)}
                    className={cn(
                      "flex items-start gap-3 py-2 text-left",
                      isReachable ? "cursor-pointer" : "cursor-not-allowed",
                    )}
                  >
                    <span className="flex flex-col items-center">
                      <span
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          isCurrent
                            ? "bg-primary text-primary-foreground"
                            : isDone
                              ? "bg-primary/20 text-primary"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {isDone ? <Check className="size-3.5" /> : s.step}
                      </span>
                      {index < WIZARD_STEPS.length - 1 && (
                        <span className="bg-outline-variant my-1 h-6 w-px" />
                      )}
                    </span>
                    <span>
                      <span
                        className={cn(
                          "block text-sm font-semibold",
                          isCurrent ? "text-primary" : "text-foreground",
                        )}
                      >
                        {s.title}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {s.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          {step === 1 && (
            <>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  Quiz Details
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Define the fundamental parameters, categorization, and
                  behavior for this assessment.
                </p>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Core Information</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div>
                    <Label htmlFor="title">Quiz Title *</Label>
                    <Input
                      id="title"
                      className="mt-1.5"
                      placeholder="e.g., Midterm Examination - Biology 101"
                      value={form.title}
                      onChange={(e) => set("title", e.target.value)}
                      aria-invalid={!!errors.title}
                    />
                    {errors.title && (
                      <p className="text-destructive mt-1 text-sm">
                        {errors.title}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      className="mt-1.5"
                      placeholder="Provide instructions or context for the students taking this quiz..."
                      value={form.description}
                      onChange={(e) => set("description", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      className="mt-1.5"
                      placeholder="e.g. MySQL"
                      value={form.subject}
                      onChange={(e) => set("subject", e.target.value)}
                      aria-invalid={!!errors.subject}
                    />
                    {errors.subject && (
                      <p className="text-destructive mt-1 text-sm">
                        {errors.subject}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Parameters</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <div>
                      <Label htmlFor="durationMinutes">
                        Duration (Minutes)
                      </Label>
                      <Input
                        id="durationMinutes"
                        type="number"
                        min={1}
                        className="mt-1.5"
                        value={form.durationMinutes}
                        onChange={(e) =>
                          set("durationMinutes", Number(e.target.value) || 1)
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="passingScore">Passing Score (%)</Label>
                      <Input
                        id="passingScore"
                        type="number"
                        min={0}
                        max={100}
                        className="mt-1.5"
                        value={form.passingScore}
                        onChange={(e) =>
                          set("passingScore", Number(e.target.value) || 0)
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="maxAttempts">Maximum Attempts</Label>
                      <Input
                        id="maxAttempts"
                        type="number"
                        min={1}
                        className="mt-1.5"
                        value={form.maxAttempts}
                        onChange={(e) =>
                          set("maxAttempts", Number(e.target.value) || 1)
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="questionsPerAttempt">
                        Questions per attempt
                      </Label>
                      <Input
                        id="questionsPerAttempt"
                        type="number"
                        min={1}
                        className="mt-1.5"
                        value={form.questionsPerAttempt}
                        onChange={(e) =>
                          set(
                            "questionsPerAttempt",
                            Number(e.target.value) || 1,
                          )
                        }
                        aria-invalid={!!errors.questionsPerAttempt}
                      />
                      {errors.questionsPerAttempt && (
                        <p className="text-destructive mt-1 text-sm">
                          {errors.questionsPerAttempt}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Quiz Behavior</CardTitle>
                  </CardHeader>
                  <CardContent className="divide-outline-variant flex flex-col divide-y">
                    <SettingToggle
                      label="Randomize questions"
                      description="Present questions in a different order for each student."
                      checked={form.randomizeQuestions}
                      onCheckedChange={(v) => set("randomizeQuestions", v)}
                    />
                    <SettingToggle
                      label="Randomize answer choices"
                      description="Shuffle multiple choice options within questions."
                      checked={form.randomizeOptions}
                      onCheckedChange={(v) => set("randomizeOptions", v)}
                    />
                    <SettingToggle
                      label="Auto-save answers"
                      description="Save progress continuously during the exam."
                      checked={form.autoSave}
                      onCheckedChange={(v) => set("autoSave", v)}
                    />
                    <SettingToggle
                      label="Auto-submit when time expires"
                      description="Force submission when the timer reaches zero."
                      checked={form.autoSubmit}
                      onCheckedChange={(v) => set("autoSubmit", v)}
                    />
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                  <div>
                    <p className="text-sm font-semibold">Security Presets</p>
                    <p className="text-muted-foreground text-xs">
                      Configured in Step 3
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant="outline"
                      className={
                        form.fullscreenRequired
                          ? "border-warning/30 bg-warning/10 text-warning"
                          : "text-muted-foreground"
                      }
                    >
                      Fullscreen{" "}
                      {form.fullscreenRequired ? "required" : "optional"}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        form.monitorActivity
                          ? "border-warning/30 bg-warning/10 text-warning"
                          : "text-muted-foreground"
                      }
                    >
                      {form.monitorActivity
                        ? "Activity monitored"
                        : "Not monitored"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {step === 2 && quizId && (
            <>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Questions</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Build the pool this quiz draws from — save it, then continue.
                </p>
              </div>
              {pool === null ? (
                <p className="text-muted-foreground text-sm">
                  Loading the question pool…
                </p>
              ) : (
                <QuizQuestionPicker quizId={quizId} initialPool={pool} />
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Rules</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Control when this quiz is available and how it&apos;s
                  proctored.
                </p>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Access window</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                      <p className="text-destructive mt-1 text-sm">
                        {errors.endAt}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Security &amp; results
                  </CardTitle>
                </CardHeader>
                <CardContent className="divide-outline-variant flex flex-col divide-y">
                  <SettingToggle
                    label="Require fullscreen"
                    description="Student must enter fullscreen to start the exam."
                    checked={form.fullscreenRequired}
                    onCheckedChange={(v) => set("fullscreenRequired", v)}
                  />
                  <SettingToggle
                    label="Monitor activity"
                    description="Record focus/visibility/fullscreen events during the exam."
                    checked={form.monitorActivity}
                    onCheckedChange={(v) => set("monitorActivity", v)}
                  />
                  <SettingToggle
                    label="Show results to students"
                    description="Students can see their score after submitting."
                    checked={form.showResults}
                    onCheckedChange={(v) => set("showResults", v)}
                  />
                </CardContent>
              </Card>
            </>
          )}

          {step === 4 && quizId && (
            <>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Review</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Double-check everything before publishing.
                </p>
              </div>
              <ReviewStep quizId={quizId} form={form} onEditStep={goToStep} />
            </>
          )}

          {step === 5 && quizId && (
            <>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Publish</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Publish, then assign it to a class or specific students.
                </p>
              </div>
              {publishData === null ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : (
                <PublishStep
                  quizId={quizId}
                  quizTitle={form.title}
                  initialStatus={publishData.status}
                  initialAssignments={publishData.assignments}
                />
              )}
            </>
          )}

          {submitError && (
            <p role="alert" className="text-destructive text-sm">
              {submitError}
            </p>
          )}

          {step === 2 && (
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => goToStep(1)}>
                <ArrowLeft className="size-4" />
                Previous
              </Button>
              <Button onClick={() => advance(3)}>
                Continue
                <ArrowRight className="size-4" />
              </Button>
            </div>
          )}
          {step === 4 && (
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => goToStep(3)}>
                <ArrowLeft className="size-4" />
                Previous
              </Button>
              <Button onClick={() => advance(5)}>
                Continue to Publish
                <ArrowRight className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
