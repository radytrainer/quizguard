"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  Flag,
  Lock,
  Maximize,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getRealtimeSocket } from "@/features/realtime/socket-client";
import { cn } from "@/lib/utils";

const CHOICE_TYPES = new Set(["multiple_choice", "true_false"]);

interface AttemptQuestionOption {
  id: string;
  text: string;
  isCorrect?: boolean;
}

interface AttemptQuestionView {
  questionId: string;
  type: string;
  text: string;
  points: number;
  options: AttemptQuestionOption[];
  answer: {
    selectedOptionIds: string[] | null;
    textAnswer: string | null;
  } | null;
}

export interface AttemptData {
  id: string;
  quizId: string;
  quizTitle: string;
  status: "in_progress" | "submitted" | "auto_submitted";
  startedAt: string;
  deadlineAt: string;
  submittedAt: string | null;
  score: number | null;
  maxScore: number | null;
  passed: boolean | null;
  reviewAvailable: boolean;
  fullscreenRequired: boolean;
  monitorActivity: boolean;
  locked: boolean;
  questions: AttemptQuestionView[];
}

type ViolationType = "fullscreen_exit" | "tab_switch" | "copy_paste";

type LocalAnswer = { selectedOptionIds: string[] } | { textAnswer: string };

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function initialAnswers(
  questions: AttemptQuestionView[],
): Record<string, LocalAnswer> {
  const map: Record<string, LocalAnswer> = {};
  for (const q of questions) {
    if (!q.answer) continue;
    if (q.answer.selectedOptionIds !== null) {
      map[q.questionId] = { selectedOptionIds: q.answer.selectedOptionIds };
    } else if (q.answer.textAnswer !== null) {
      map[q.questionId] = { textAnswer: q.answer.textAnswer };
    }
  }
  return map;
}

/** "Flag for review" is a personal navigation aid, not exam data — never sent to the server,
 * never seen by a teacher (unlike the monitoring violation flags shown in the header, a
 * completely separate concept this only shares an icon with). Kept in localStorage, keyed per
 * attempt, purely so an accidental refresh mid-exam doesn't lose it. */
function useFlaggedQuestions(attemptId: string) {
  const storageKey = `examguard:review-flags:${attemptId}`;
  const [flagged, setFlagged] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([...flagged]));
    } catch {
      // Best-effort only — a full/blocked localStorage just means flags won't survive a
      // refresh, not a reason to interrupt the exam with an error.
    }
  }, [storageKey, flagged]);

  const toggle = useCallback((questionId: string) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }, []);

  return { flagged, toggle };
}

export function ExamAttempt({
  initialAttempt,
}: {
  initialAttempt: AttemptData;
}) {
  const [attempt, setAttempt] = useState(initialAttempt);
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>(() =>
    initialAnswers(initialAttempt.questions),
  );
  const [remainingMs, setRemainingMs] = useState(
    () => new Date(initialAttempt.deadlineAt).getTime() - Date.now(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { flagged, toggle: toggleFlag } = useFlaggedQuestions(attempt.id);
  const autoSubmitted = useRef(false);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const wasFullscreen = useRef(false);
  // Brackets this component's own confirm() call below so it can't be mistaken for the student
  // leaving the page — see the `window.blur` listener in the monitoring effect.
  const suppressBlurUntil = useRef(0);

  const inProgress = attempt.status === "in_progress";
  const monitored = attempt.fullscreenRequired || attempt.monitorActivity;
  const lockedActive = inProgress && attempt.locked;
  const fullscreenGateActive =
    inProgress &&
    !attempt.locked &&
    attempt.fullscreenRequired &&
    !isFullscreen;

  const reportViolation = useCallback(
    (type: ViolationType) => {
      if (attempt.locked) return; // already locked — nothing more to record until unlocked
      setViolationCount((n) => n + 1);
      void fetch(`/api/attempts/${attempt.id}/violations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      })
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json()) as { locked?: boolean };
          if (data.locked) {
            setAttempt((prev) => ({ ...prev, locked: true }));
          }
        })
        .catch(() => {
          // Best-effort reporting; nothing to retry mid-exam if this particular beacon fails.
        });
    },
    [attempt.id, attempt.locked],
  );

  useEffect(() => {
    function handleFullscreenChange() {
      const active = document.fullscreenElement !== null;
      setIsFullscreen(active);
      if (!active && wasFullscreen.current && inProgress) {
        reportViolation("fullscreen_exit");
      }
      wasFullscreen.current = active;
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    handleFullscreenChange();
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [inProgress, reportViolation]);

  useEffect(() => {
    if (!inProgress || !attempt.monitorActivity) return;
    let lastFocusLossAt = 0;

    // `visibilitychange` only reliably fires for an actual tab switch or minimize — alt-tabbing
    // to another app, or opening browser-chrome UI that docks alongside the page instead of
    // covering it (e.g. Chrome's built-in side panel, including its AI assistant), leaves
    // `document.hidden` false while still moving focus off this window. `window.blur` catches
    // that gap; the two listeners often fire together for a real tab switch, so this collapses
    // any pair within 500ms into one flagged violation instead of double-counting.
    function reportFocusLoss() {
      const now = Date.now();
      if (now - lastFocusLossAt < 500) return;
      lastFocusLossAt = now;
      reportViolation("tab_switch");
    }
    function handleVisibilityChange() {
      if (document.hidden) reportFocusLoss();
    }
    function handleBlur() {
      if (Date.now() < suppressBlurUntil.current) return;
      reportFocusLoss();
    }
    function handleCopyOrCut() {
      reportViolation("copy_paste");
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("copy", handleCopyOrCut);
    document.addEventListener("cut", handleCopyOrCut);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("copy", handleCopyOrCut);
      document.removeEventListener("cut", handleCopyOrCut);
    };
  }, [inProgress, attempt.monitorActivity, reportViolation]);

  useEffect(() => {
    if (!inProgress) return;
    const socket = getRealtimeSocket();
    function join() {
      socket.emit("join:attempt", attempt.id);
    }
    // A teacher unlocking this attempt happens from an entirely different browser session —
    // this is the only way this tab finds out, short of polling.
    function handleEvent(event: { type: string; attemptId: string }) {
      if (event.type !== "attempt_unlocked" || event.attemptId !== attempt.id) {
        return;
      }
      setAttempt((prev) => ({ ...prev, locked: false }));
    }
    if (socket.connected) join();
    socket.on("connect", join);
    socket.on("event", handleEvent);
    return () => {
      socket.off("connect", join);
      socket.off("event", handleEvent);
      socket.emit("leave:attempt", attempt.id);
    };
  }, [inProgress, attempt.id]);

  async function enterFullscreen() {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Some browsers/embeds refuse fullscreen (e.g. no user-gesture context detected); the
      // gate just stays up and the student can retry.
    }
  }

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/attempts/${attempt.id}/submit`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? "Failed to submit.");
        return;
      }
      const refreshed = await fetch(`/api/attempts/${attempt.id}`);
      if (refreshed.ok) {
        const data = (await refreshed.json()) as { attempt: AttemptData };
        setAttempt(data.attempt);
      }
    } finally {
      setSubmitting(false);
    }
  }, [attempt.id]);

  function handleSubmitClick() {
    suppressBlurUntil.current = Date.now() + 1000;
    if (!confirm("Submit this attempt? You can't change answers after.")) {
      return;
    }
    void handleSubmit();
  }

  useEffect(() => {
    if (!inProgress) return;
    const interval = setInterval(() => {
      const next = new Date(attempt.deadlineAt).getTime() - Date.now();
      setRemainingMs(next);
      if (next <= 0 && !autoSubmitted.current) {
        autoSubmitted.current = true;
        void handleSubmit();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [inProgress, attempt.deadlineAt, handleSubmit]);

  function saveAnswer(questionId: string, response: LocalAnswer) {
    void Promise.resolve().then(async () => {
      try {
        await fetch(`/api/attempts/${attempt.id}/answers`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId, ...response }),
        });
      } catch {
        // Best-effort autosave; the next change (or the final submit) will retry implicitly.
      }
    });
  }

  function handleChoiceChange(questionId: string, optionId: string) {
    const response: LocalAnswer = { selectedOptionIds: [optionId] };
    setAnswers((prev) => ({ ...prev, [questionId]: response }));
    saveAnswer(questionId, response);
  }

  function handleMultiChange(
    questionId: string,
    optionId: string,
    checked: boolean,
  ) {
    setAnswers((prev) => {
      const current =
        prev[questionId] && "selectedOptionIds" in prev[questionId]
          ? (prev[questionId] as { selectedOptionIds: string[] })
              .selectedOptionIds
          : [];
      const next = checked
        ? [...current, optionId]
        : current.filter((id) => id !== optionId);
      const response: LocalAnswer = { selectedOptionIds: next };
      saveAnswer(questionId, response);
      return { ...prev, [questionId]: response };
    });
  }

  function handleTextChange(questionId: string, value: string) {
    const response: LocalAnswer = { textAnswer: value };
    setAnswers((prev) => ({ ...prev, [questionId]: response }));

    clearTimeout(saveTimers.current[questionId]);
    saveTimers.current[questionId] = setTimeout(() => {
      saveAnswer(questionId, response);
    }, 600);
  }

  const isAnswered = useCallback(
    (questionId: string): boolean => {
      const local = answers[questionId];
      if (!local) return false;
      if ("selectedOptionIds" in local) {
        return local.selectedOptionIds.length > 0;
      }
      return local.textAnswer.trim().length > 0;
    },
    [answers],
  );

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = attempt.questions.length;
  // Clamp defensively: switching a resumed attempt's question count out from under a stale
  // currentIndex shouldn't be possible in practice, but indexing past the end would crash.
  const safeIndex = Math.min(currentIndex, Math.max(0, totalQuestions - 1));
  const currentQuestion = attempt.questions[safeIndex] as
    AttemptQuestionView | undefined;
  const isLastQuestion = safeIndex === totalQuestions - 1;

  const local = currentQuestion
    ? answers[currentQuestion.questionId]
    : undefined;
  const isChoice = currentQuestion
    ? CHOICE_TYPES.has(currentQuestion.type)
    : false;
  const isMulti = currentQuestion?.type === "multiple_answer";
  const isText = currentQuestion ? !isChoice && !isMulti : false;
  const selectedIds =
    local && "selectedOptionIds" in local ? local.selectedOptionIds : [];
  const textValue = local && "textAnswer" in local ? local.textAnswer : "";

  const mapEntries = useMemo(
    () =>
      attempt.questions.map((q, index) => ({
        index,
        questionId: q.questionId,
        answered: isAnswered(q.questionId),
        flagged: flagged.has(q.questionId),
      })),
    [attempt.questions, isAnswered, flagged],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card border-outline-variant flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 shadow-sm">
        <p className="text-lg font-bold">
          {inProgress ? "Exam Mode" : "Review"}
          <span className="text-muted-foreground mx-2 font-normal">|</span>
          <span className="text-muted-foreground text-base font-normal">
            {attempt.quizTitle}
          </span>
        </p>
        <div className="flex items-center gap-2">
          {lockedActive && (
            <Badge
              variant="outline"
              className="border-destructive/30 bg-destructive/10 text-destructive gap-1.5"
            >
              <Lock className="size-3.5" />
              Locked
            </Badge>
          )}
          {inProgress && violationCount > 0 && (
            <Badge
              variant="outline"
              className="border-warning/30 bg-warning/10 text-warning gap-1.5"
            >
              <ShieldAlert className="size-3.5" />
              {violationCount} flagged
            </Badge>
          )}
          {inProgress && (
            <Badge
              variant="outline"
              className={cn(
                "gap-1.5 px-3 py-1 font-mono text-sm",
                remainingMs < 60_000
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-warning/30 bg-warning/10 text-warning",
              )}
            >
              <Clock className="size-3.5" />
              <span suppressHydrationWarning>
                {formatRemaining(remainingMs)}
              </span>
            </Badge>
          )}
          {!inProgress && (
            <Badge
              variant="outline"
              className={
                attempt.passed
                  ? "border-success/30 bg-success/10 text-success gap-1.5"
                  : "border-destructive/30 bg-destructive/10 text-destructive gap-1.5"
              }
            >
              {attempt.passed ? (
                <CheckCircle2 className="size-3.5" />
              ) : (
                <XCircle className="size-3.5" />
              )}
              {attempt.passed ? "Passed" : "Not passed"}
            </Badge>
          )}
          {inProgress && !fullscreenGateActive && !lockedActive && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleSubmitClick}
              disabled={submitting}
            >
              End Exam
            </Button>
          )}
        </div>
      </div>

      {!inProgress && (
        <p className="text-sm">
          Score:{" "}
          <span className="font-semibold">
            {attempt.score} / {attempt.maxScore}
          </span>
        </p>
      )}

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {inProgress && monitored && (
        <div className="border-warning/30 bg-warning/5 text-warning flex items-start gap-2 rounded-lg border p-3 text-sm">
          <Eye className="mt-0.5 size-4 shrink-0" />
          <p>
            This exam is monitored: exiting fullscreen{" "}
            {attempt.monitorActivity && "or switching tabs "}
            is recorded and visible to your teacher. Nothing outside this
            browser tab is seen or recorded.
          </p>
        </div>
      )}

      {lockedActive && (
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <Lock className="text-destructive size-8" />
            <div>
              <p className="font-medium">This exam has been locked</p>
              <p className="text-muted-foreground mt-1 max-w-md text-sm">
                You exited fullscreen after starting. Your teacher can see this
                and needs to unlock your attempt before you can continue — your
                timer keeps running while you wait.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!lockedActive && fullscreenGateActive && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <Maximize className="text-muted-foreground size-8" />
            <div>
              <p className="font-medium">This exam requires fullscreen mode</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Your timer keeps running while this screen is up — enter
                fullscreen to continue.
              </p>
            </div>
            <Button onClick={() => void enterFullscreen()}>
              Enter Fullscreen &amp; Continue
            </Button>
          </CardContent>
        </Card>
      )}

      {!lockedActive && !fullscreenGateActive && currentQuestion && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    Question {safeIndex + 1} of {totalQuestions}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        isAnswered(currentQuestion.questionId)
                          ? "border-success/30 bg-success/10 text-success"
                          : "text-muted-foreground"
                      }
                    >
                      {isAnswered(currentQuestion.questionId)
                        ? "Answered"
                        : "Unanswered"}
                    </Badge>
                    <Badge variant="outline">{currentQuestion.points} pt</Badge>
                    {inProgress && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={
                          flagged.has(currentQuestion.questionId)
                            ? "Unflag this question"
                            : "Flag this question for review"
                        }
                        onClick={() => toggleFlag(currentQuestion.questionId)}
                      >
                        <Flag
                          className={cn(
                            "size-4",
                            flagged.has(currentQuestion.questionId)
                              ? "fill-destructive text-destructive"
                              : "text-muted-foreground",
                          )}
                        />
                      </Button>
                    )}
                  </div>
                </div>
                <CardTitle className="mt-2 text-base font-normal">
                  {currentQuestion.text}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isChoice && (
                  <RadioGroup
                    value={selectedIds[0] ?? ""}
                    onValueChange={(value) =>
                      handleChoiceChange(currentQuestion.questionId, value)
                    }
                    className="gap-2"
                  >
                    {currentQuestion.options.map((option) => {
                      const checked = selectedIds.includes(option.id);
                      const showCorrectness = attempt.reviewAvailable;
                      return (
                        <label
                          key={option.id}
                          className={cn(
                            "border-outline-variant flex items-center gap-3 rounded-lg border p-3 text-sm",
                            showCorrectness &&
                              option.isCorrect &&
                              "border-success/40 bg-success/5",
                            showCorrectness &&
                              !option.isCorrect &&
                              checked &&
                              "border-destructive/40 bg-destructive/5",
                          )}
                        >
                          <RadioGroupItem
                            value={option.id}
                            disabled={!inProgress}
                          />
                          <span className="flex-1">{option.text}</span>
                          {showCorrectness && option.isCorrect && (
                            <CheckCircle2 className="text-success size-4 shrink-0" />
                          )}
                        </label>
                      );
                    })}
                  </RadioGroup>
                )}
                {isMulti && (
                  <div className="flex flex-col gap-2">
                    {currentQuestion.options.map((option) => {
                      const checked = selectedIds.includes(option.id);
                      const showCorrectness = attempt.reviewAvailable;
                      return (
                        <label
                          key={option.id}
                          className={cn(
                            "border-outline-variant flex items-center gap-3 rounded-lg border p-3 text-sm",
                            showCorrectness &&
                              option.isCorrect &&
                              "border-success/40 bg-success/5",
                            showCorrectness &&
                              !option.isCorrect &&
                              checked &&
                              "border-destructive/40 bg-destructive/5",
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={!inProgress}
                            onCheckedChange={(value) =>
                              handleMultiChange(
                                currentQuestion.questionId,
                                option.id,
                                value === true,
                              )
                            }
                          />
                          <span className="flex-1">{option.text}</span>
                          {showCorrectness && option.isCorrect && (
                            <CheckCircle2 className="text-success size-4 shrink-0" />
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
                {isText && (
                  <Input
                    value={textValue}
                    disabled={!inProgress}
                    onChange={(e) =>
                      handleTextChange(
                        currentQuestion.questionId,
                        e.target.value,
                      )
                    }
                    placeholder="Type your answer..."
                  />
                )}
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                disabled={safeIndex === 0}
                onClick={() => setCurrentIndex((i) => i - 1)}
              >
                <ArrowLeft className="size-4" />
                Previous
              </Button>
              {inProgress && isLastQuestion ? (
                <Button onClick={handleSubmitClick} disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit"}
                </Button>
              ) : (
                <Button
                  disabled={isLastQuestion}
                  onClick={() => setCurrentIndex((i) => i + 1)}
                >
                  Next Question
                  <ArrowRight className="size-4" />
                </Button>
              )}
            </div>
          </div>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">Question Map</CardTitle>
              <CardDescription>
                {answeredCount} of {totalQuestions} answered
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="bg-primary inline-block size-2.5 rounded-full" />
                  Answered
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="border-outline-variant inline-block size-2.5 rounded-full border" />
                  Unanswered
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="ring-primary inline-block size-2.5 rounded-full ring-2" />
                  Current
                </span>
                {inProgress && (
                  <span className="flex items-center gap-1.5">
                    <Flag className="fill-destructive text-destructive size-3" />
                    Flagged
                  </span>
                )}
              </div>
              <div className="grid grid-cols-5 gap-2">
                {mapEntries.map((entry) => (
                  <button
                    key={entry.questionId}
                    type="button"
                    onClick={() => setCurrentIndex(entry.index)}
                    aria-label={`Question ${entry.index + 1}${
                      entry.answered ? ", answered" : ", unanswered"
                    }${entry.flagged ? ", flagged" : ""}${
                      entry.index === safeIndex ? ", current" : ""
                    }`}
                    className={cn(
                      "relative flex size-9 items-center justify-center rounded-full border text-sm font-medium transition-colors",
                      entry.answered
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-outline-variant",
                      entry.index === safeIndex &&
                        "ring-primary ring-2 ring-offset-1",
                    )}
                  >
                    {entry.index + 1}
                    {entry.flagged && (
                      <Flag className="fill-destructive text-destructive absolute -top-1.5 -right-1.5 size-3" />
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!inProgress && !attempt.reviewAvailable && (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <AlertTriangle className="size-4" />
          This quiz doesn&apos;t show a detailed answer review.
        </p>
      )}
    </div>
  );
}
