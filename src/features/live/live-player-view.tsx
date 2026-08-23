"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Award,
  CheckCircle2,
  Clock,
  Radio,
  Trophy,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type {
  LiveLeaderboardEntry,
  LiveQuestionView,
  LiveStateSync,
  LiveYourResult,
} from "@/backend/live/live.schema";
import { AnimatedLeaderboardList } from "@/features/live/animated-leaderboard";
import { LeaderboardPodium } from "@/features/live/leaderboard-podium";
import { getLiveOptionStyle } from "@/features/live/option-styles";
import { getRealtimeSocket } from "@/features/realtime/socket-client";
import { cn } from "@/lib/utils";

type Phase =
  | "connecting"
  | "waiting"
  | "question"
  | "answered"
  | "reveal"
  | "leaderboard"
  | "finished"
  | "cancelled"
  | "join_failed";

export function LivePlayerView({
  sessionId,
  guestName,
}: {
  sessionId: string;
  // Set only by the no-account "anyone with the code" path (features/live/guest-join.tsx) —
  // an authenticated student/host is identified from their session cookie instead, same as
  // every other realtime feature in this app.
  guestName?: string;
}) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [quizTitle, setQuizTitle] = useState("");
  const [question, setQuestion] = useState<LiveQuestionView | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [correctOptionIds, setCorrectOptionIds] = useState<string[]>([]);
  const [yourResult, setYourResult] = useState<LiveYourResult | null>(null);
  const [totalScore, setTotalScore] = useState(0);
  const [yourRank, setYourRank] = useState<number | null>(null);
  const [leaderboardTop, setLeaderboardTop] = useState<LiveLeaderboardEntry[]>(
    [],
  );
  const [standings, setStandings] = useState<LiveLeaderboardEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Persisted per session (not per game — a new sessionId always gets a fresh token) so a
  // guest's own tab reconnecting (a refresh, a brief network drop) resumes the same
  // participant row and score instead of joining as a second player. Never sent anywhere for
  // an authenticated join, and never written to anything durable beyond this tab.
  const [guestToken] = useState(() => {
    if (!guestName || typeof window === "undefined") return null;
    const key = `qg:guest-token:${sessionId}`;
    try {
      const existing = window.sessionStorage.getItem(key);
      if (existing) return existing;
      const token = crypto.randomUUID();
      window.sessionStorage.setItem(key, token);
      return token;
    } catch {
      // sessionStorage can be blocked (private mode, disabled storage) — fall back to an
      // in-memory token, which still lets the guest play, just without surviving a refresh.
      return crypto.randomUUID();
    }
  });

  // Distinguishes "the join itself failed" (e.g. the game already ended — never gets a
  // live:state_sync at all) from a transient in-game error (submitting after the window
  // closed) — only the former should replace the whole screen instead of just showing an
  // inline banner over whatever phase we're already in.
  const hasJoinedRef = useRef(false);

  useEffect(() => {
    const socket = getRealtimeSocket();

    function join() {
      // Reset on every attempt (not just once per effect) — a reconnect re-emits `live:join`
      // too, and that retry can fail on its own (the game ended while we were disconnected),
      // which should be treated the same as a first-attempt failure.
      hasJoinedRef.current = false;
      socket.emit(
        "live:join",
        guestName && guestToken
          ? { sessionId, guestName, guestToken }
          : { sessionId },
      );
    }
    function onStateSync(state: LiveStateSync) {
      hasJoinedRef.current = true;
      setQuizTitle(state.quizTitle);
      setTotalScore(state.score);
      if (state.status === "lobby") {
        setPhase("waiting");
      } else if (state.status === "question" && state.currentQuestion) {
        setQuestion(state.currentQuestion);
        setPhase(state.alreadyAnswered ? "answered" : "question");
      } else if (state.status === "finished") {
        setPhase("finished");
      } else if (state.status === "cancelled") {
        setPhase("cancelled");
      } else {
        // Mid reveal/leaderboard on reconnect — no snapshot for those; the next broadcast
        // (or the host's next action) will bring this in sync.
        setPhase("waiting");
      }
    }
    function onQuestion(payload: LiveQuestionView) {
      setQuestion(payload);
      setSelected([]);
      setCorrectOptionIds([]);
      setYourResult(null);
      setPhase("question");
    }
    function onAnswerAck() {
      setPhase("answered");
    }
    function onReveal(payload: { correctOptionIds: string[] }) {
      setCorrectOptionIds(payload.correctOptionIds);
      setPhase("reveal");
    }
    function onYourResult(payload: LiveYourResult) {
      setYourResult(payload);
      setTotalScore(payload.totalScore);
    }
    function onLeaderboard(payload: { top: LiveLeaderboardEntry[] }) {
      setLeaderboardTop(payload.top);
      setPhase("leaderboard");
    }
    function onYourRank(payload: { rank: number }) {
      setYourRank(payload.rank);
    }
    function onFinished(payload: { standings: LiveLeaderboardEntry[] }) {
      setStandings(payload.standings);
      setPhase("finished");
    }
    function onEnded() {
      setPhase("cancelled");
    }
    function onErrorEvent(message: string) {
      setError(message);
      if (!hasJoinedRef.current) setPhase("join_failed");
    }

    if (socket.connected) join();
    socket.on("connect", join);
    socket.on("live:state_sync", onStateSync);
    socket.on("live:question", onQuestion);
    socket.on("live:answer_ack", onAnswerAck);
    socket.on("live:reveal", onReveal);
    socket.on("live:your_result", onYourResult);
    socket.on("live:leaderboard", onLeaderboard);
    socket.on("live:your_rank", onYourRank);
    socket.on("live:finished", onFinished);
    socket.on("live:ended", onEnded);
    socket.on("live:error", onErrorEvent);

    return () => {
      socket.off("connect", join);
      socket.off("live:state_sync", onStateSync);
      socket.off("live:question", onQuestion);
      socket.off("live:answer_ack", onAnswerAck);
      socket.off("live:reveal", onReveal);
      socket.off("live:your_result", onYourResult);
      socket.off("live:leaderboard", onLeaderboard);
      socket.off("live:your_rank", onYourRank);
      socket.off("live:finished", onFinished);
      socket.off("live:ended", onEnded);
      socket.off("live:error", onErrorEvent);
    };
  }, [sessionId, guestName, guestToken]);

  useEffect(() => {
    if (phase !== "question") return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [phase]);

  const remainingSeconds = useMemo(() => {
    if (!question) return 0;
    const elapsed = now - new Date(question.startedAt).getTime();
    const remaining = question.timeLimitSeconds * 1000 - elapsed;
    return Math.max(0, Math.ceil(remaining / 1000));
  }, [question, now]);

  const remainingPercent = question
    ? Math.round((remainingSeconds / question.timeLimitSeconds) * 100)
    : 0;

  const isMultiAnswer = question?.type === "multiple_answer";

  function submitSingle(optionId: string) {
    if (!question || phase !== "question") return;
    getRealtimeSocket().emit("live:answer", {
      sessionId,
      questionIndex: question.questionIndex,
      selectedOptionIds: [optionId],
    });
    setSelected([optionId]);
  }

  function toggleMulti(optionId: string) {
    if (phase !== "question") return;
    setSelected((prev) =>
      prev.includes(optionId)
        ? prev.filter((id) => id !== optionId)
        : [...prev, optionId],
    );
  }

  function submitMulti() {
    if (!question || phase !== "question" || selected.length === 0) return;
    getRealtimeSocket().emit("live:answer", {
      sessionId,
      questionIndex: question.questionIndex,
      selectedOptionIds: selected,
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight">
            {quizTitle || "Live game"}
          </h1>
        </div>
        <div className="border-border bg-card flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold">
          <Trophy className="text-primary size-4" />
          {totalScore}
        </div>
      </div>

      {error && phase !== "join_failed" && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {phase === "join_failed" && (
        <div className="border-border bg-card flex flex-col items-center gap-4 rounded-2xl border p-10 text-center">
          <XCircle className="text-muted-foreground size-10" />
          <p className="font-medium">{error ?? "Couldn't join this game."}</p>
          <Button asChild variant="secondary">
            <Link href={guestName ? "/play" : "/student"}>
              {guestName ? "Play another game" : "Back to Dashboard"}
            </Link>
          </Button>
        </div>
      )}

      {(phase === "connecting" || phase === "waiting") && (
        <div className="border-border bg-card flex flex-col items-center gap-4 rounded-2xl border p-10 text-center">
          <Radio className="text-primary size-8 animate-pulse" />
          <p className="font-medium">You&apos;re in!</p>
          <p className="text-muted-foreground text-sm">
            Waiting for the host to start the game…
          </p>
        </div>
      )}

      {(phase === "question" || phase === "answered") && question && (
        <div className="border-border bg-card flex flex-col gap-5 rounded-2xl border p-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Question {question.questionIndex + 1} of {question.totalQuestions}
            </span>
            <span className="flex items-center gap-1 font-mono font-semibold">
              <Clock className="size-3.5" />
              {remainingSeconds}s
            </span>
          </div>
          <Progress value={remainingPercent} className="h-2" />

          {phase === "question" ? (
            <>
              <p className="text-center text-lg font-semibold">
                {question.text}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {question.options.map((option, i) => {
                  const { Icon, className } = getLiveOptionStyle(
                    question.questionIndex,
                    i,
                  );
                  const isSelected = selected.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() =>
                        isMultiAnswer
                          ? toggleMulti(option.id)
                          : submitSingle(option.id)
                      }
                      className={cn(
                        "flex items-center gap-3 rounded-xl p-5 text-left font-medium transition-transform active:scale-95",
                        className,
                        isSelected && "ring-foreground/60 ring-4",
                      )}
                    >
                      <Icon className="size-5 shrink-0" />
                      {option.text}
                    </button>
                  );
                })}
              </div>
              {isMultiAnswer && (
                <Button onClick={submitMulti} disabled={selected.length === 0}>
                  Submit Answer
                </Button>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="text-success size-10" />
              <p className="font-medium">Answer locked in!</p>
              <p className="text-muted-foreground text-sm">
                Waiting for other players…
              </p>
            </div>
          )}
        </div>
      )}

      {phase === "reveal" && question && (
        <div className="border-border bg-card flex flex-col items-center gap-4 rounded-2xl border p-8 text-center">
          {yourResult?.isCorrect ? (
            <>
              <CheckCircle2 className="text-success size-12" />
              <p className="text-xl font-bold">Correct!</p>
              <p className="text-muted-foreground text-sm">
                +{yourResult.pointsAwarded} points
              </p>
            </>
          ) : (
            <>
              <XCircle className="text-destructive size-12" />
              <p className="text-xl font-bold">
                {yourResult ? "Not quite" : "No answer submitted"}
              </p>
            </>
          )}
          <div className="mt-2 flex w-full flex-col gap-2">
            {question.options.map((option, i) => {
              const { Icon, className } = getLiveOptionStyle(
                question.questionIndex,
                i,
              );
              const isCorrect = correctOptionIds.includes(option.id);
              return (
                <div
                  key={option.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl p-3 text-left font-medium",
                    className,
                    !isCorrect && "opacity-50",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {option.text}
                  {isCorrect && <CheckCircle2 className="ml-auto size-4" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {phase === "leaderboard" && (
        <div className="border-border bg-card flex flex-col gap-5 rounded-2xl border p-6">
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-muted-foreground text-sm">Your rank</p>
            <p className="text-3xl font-bold">
              {yourRank ? `#${yourRank}` : "—"}
            </p>
          </div>
          <AnimatedLeaderboardList entries={leaderboardTop} />
        </div>
      )}

      {phase === "finished" && (
        <div className="border-border bg-card flex flex-col items-center gap-4 rounded-2xl border p-8 text-center">
          <Award className="text-primary size-10" />
          <p className="text-lg font-semibold">Game over!</p>
          <p className="text-muted-foreground text-sm">
            Final score: {totalScore}
          </p>
          {standings.length > 0 && <LeaderboardPodium standings={standings} />}
          <Button asChild>
            <Link href={guestName ? "/play" : "/student"}>
              {guestName ? "Play another game" : "Back to Dashboard"}
            </Link>
          </Button>
        </div>
      )}

      {phase === "cancelled" && (
        <div className="border-border bg-card flex flex-col items-center gap-4 rounded-2xl border p-10 text-center">
          <XCircle className="text-muted-foreground size-10" />
          <p className="font-medium">This game was ended by the host.</p>
          <Button asChild variant="secondary">
            <Link href={guestName ? "/play" : "/student"}>
              {guestName ? "Play another game" : "Back to Dashboard"}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
