"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Radio, Trophy, XCircle } from "lucide-react";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type {
  LiveAvatar,
  LiveLeaderboardEntry,
  LiveQuestionView,
  LiveStateSync,
  LiveYourResult,
} from "@/backend/live/live.schema";
import {
  AnimatedLeaderboardList,
  AnimatedScore,
} from "@/features/live/animated-leaderboard";
import { ConfettiBurst } from "@/features/live/animations/confetti";
import { CountdownEmphasis } from "@/features/live/animations/countdown-emphasis";
import { LottieEffect } from "@/features/live/animations/lottie-effect";
import { QuizStartSequence } from "@/features/live/animations/quiz-start-sequence";
import { ResultScoreCounter } from "@/features/live/animations/result-score-counter";
import {
  correctPopVariants,
  optionItemVariants,
  optionListVariants,
  overlayVariants,
  questionCardVariants,
  wrongShakeVariants,
} from "@/features/live/animations/variants";
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
  guestAvatar,
}: {
  sessionId: string;
  // Set only by the no-account "anyone with the code" path (features/live/guest-join.tsx) —
  // an authenticated student/host is identified from their session cookie instead, same as
  // every other realtime feature in this app.
  guestName?: string;
  // Picked at the same guest-live-entry.tsx step as guestName — an authenticated join never
  // sends one and gets one assigned at random server-side instead (pickRandomAvatar).
  guestAvatar?: LiveAvatar;
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
  // Purely cosmetic, purely local state — never anything the realtime/business logic reads.
  // `showStartSequence` gates the one-time "GET READY / 3 / 2 / 1 / GO!" overlay (see
  // animations/quiz-start-sequence.tsx's own comment on why this never delays the real
  // question/timer underneath). The two `*Burst` counters are "fire a confetti burst" signals —
  // ConfettiBurst treats any change to the number as "go", so incrementing is enough; the value
  // itself is never read for anything else.
  const [showStartSequence, setShowStartSequence] = useState(false);
  const [correctBurst, setCorrectBurst] = useState(0);
  const [finishedBurst, setFinishedBurst] = useState(0);
  const startSequenceShownRef = useRef(false);
  const finishedCelebratedRef = useRef(false);
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
          ? { sessionId, guestName, guestToken, avatar: guestAvatar }
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
        if (state.currentQuestion.questionIndex === 0) {
          startSequenceShownRef.current = true;
        }
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
      // Only ever for the very first question of a game — see quiz-start-sequence.tsx for why
      // this can render on top of the real countdown without touching it.
      if (payload.questionIndex === 0 && !startSequenceShownRef.current) {
        startSequenceShownRef.current = true;
        setShowStartSequence(true);
      }
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
      if (payload.isCorrect) setCorrectBurst((n) => n + 1);
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
  }, [sessionId, guestName, guestToken, guestAvatar]);

  useEffect(() => {
    if (phase !== "question") return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [phase]);

  // The one-shot final-results celebration — guarded so a re-render (or a reconnect that
  // replays `live:finished`) never fires a second burst.
  useEffect(() => {
    if (phase !== "finished" || finishedCelebratedRef.current) return;
    finishedCelebratedRef.current = true;
    setFinishedBurst((n) => n + 1);
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
      {showStartSequence && (
        <QuizStartSequence onDone={() => setShowStartSequence(false)} />
      )}
      <ConfettiBurst trigger={correctBurst} />
      <ConfettiBurst trigger={finishedBurst} />

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight">
            {quizTitle || "Live game"}
          </h1>
        </div>
        <div className="border-border bg-card flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold">
          <Trophy className="text-primary size-4" />
          <AnimatedScore value={totalScore} />
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
        <motion.div
          variants={questionCardVariants}
          initial="initial"
          animate="animate"
          className="border-border bg-card flex flex-col items-center gap-4 rounded-2xl border p-10 text-center"
        >
          <Radio className="text-primary size-8 animate-pulse" />
          <p className="font-medium">You&apos;re in!</p>
          <p className="text-muted-foreground text-sm">
            Waiting for the host to start the game…
          </p>
        </motion.div>
      )}

      {(phase === "question" || phase === "answered") && question && (
        <motion.div
          key={question.questionIndex}
          variants={questionCardVariants}
          initial="initial"
          animate="animate"
          className="border-border bg-card flex flex-col gap-5 rounded-2xl border p-6"
        >
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Question {question.questionIndex + 1} of {question.totalQuestions}
            </span>
            <CountdownEmphasis
              seconds={remainingSeconds}
              className="flex items-center gap-1 font-mono font-semibold"
            >
              <Clock className="size-3.5" />
              {remainingSeconds}s
            </CountdownEmphasis>
          </div>
          <Progress value={remainingPercent} className="h-2" />

          {phase === "question" ? (
            <>
              <p className="text-center text-lg font-semibold">
                {question.text}
              </p>
              <motion.div
                variants={optionListVariants}
                initial="initial"
                animate="animate"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                {question.options.map((option, i) => {
                  const { Icon, className } = getLiveOptionStyle(
                    question.questionIndex,
                    i,
                  );
                  const isSelected = selected.includes(option.id);
                  return (
                    <motion.button
                      key={option.id}
                      type="button"
                      variants={optionItemVariants}
                      whileHover={{ scale: 1.03, y: -3 }}
                      whileTap={{ scale: 0.95 }}
                      animate={
                        isSelected ? { scale: [1, 0.97, 1.02, 1] } : undefined
                      }
                      transition={{ duration: 0.32, ease: "easeInOut" }}
                      onClick={() =>
                        isMultiAnswer
                          ? toggleMulti(option.id)
                          : submitSingle(option.id)
                      }
                      className={cn(
                        "flex items-center gap-3 rounded-xl p-5 text-left font-medium shadow-sm transition-shadow hover:shadow-lg",
                        className,
                        isSelected && "ring-foreground/60 ring-4",
                      )}
                    >
                      <Icon className="size-5 shrink-0" />
                      {option.text}
                    </motion.button>
                  );
                })}
              </motion.div>
              {isMultiAnswer && (
                <Button onClick={submitMulti} disabled={selected.length === 0}>
                  Submit Answer
                </Button>
              )}
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 22 }}
              className="flex flex-col items-center gap-3 py-8 text-center"
            >
              <CheckCircle2 className="text-success size-10" />
              <p className="font-medium">Answer locked in!</p>
              <p className="text-muted-foreground text-sm">
                Waiting for other players…
              </p>
            </motion.div>
          )}
        </motion.div>
      )}

      {phase === "reveal" && question && (
        <motion.div
          variants={questionCardVariants}
          initial="initial"
          animate="animate"
          className="border-border bg-card flex flex-col items-center gap-4 rounded-2xl border p-8 text-center"
        >
          {yourResult?.isCorrect ? (
            <>
              <LottieEffect kind="correct" size={64} />
              <p className="text-xl font-bold">Correct!</p>
              <p className="text-muted-foreground text-sm">
                +{yourResult.pointsAwarded} points
              </p>
            </>
          ) : (
            <motion.div
              variants={wrongShakeVariants}
              initial="initial"
              animate="shake"
              className="flex flex-col items-center gap-2"
            >
              <LottieEffect kind="wrong" size={64} />
              <p className="text-xl font-bold">
                {yourResult ? "Not quite" : "No answer submitted"}
              </p>
            </motion.div>
          )}
          <div className="mt-2 flex w-full flex-col gap-2">
            {question.options.map((option, i) => {
              const { Icon, className } = getLiveOptionStyle(
                question.questionIndex,
                i,
              );
              const isCorrect = correctOptionIds.includes(option.id);
              const wasSelectedWrong =
                selected.includes(option.id) && !isCorrect;
              const feedbackMotionProps = isCorrect
                ? {
                    variants: correctPopVariants,
                    initial: "initial",
                    animate: "pop",
                  }
                : wasSelectedWrong
                  ? {
                      variants: wrongShakeVariants,
                      initial: "initial",
                      animate: "shake",
                    }
                  : {};
              return (
                <motion.div
                  key={option.id}
                  {...feedbackMotionProps}
                  className={cn(
                    "flex items-center gap-3 rounded-xl p-3 text-left font-medium",
                    className,
                    !isCorrect && "opacity-50",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {option.text}
                  {isCorrect && <CheckCircle2 className="ml-auto size-4" />}
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {phase === "leaderboard" && (
        <motion.div
          variants={questionCardVariants}
          initial="initial"
          animate="animate"
          className="border-border bg-card flex flex-col gap-5 rounded-2xl border p-6"
        >
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-muted-foreground text-sm">Your rank</p>
            <motion.p
              key={yourRank ?? "none"}
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
              className="text-3xl font-bold"
            >
              {yourRank ? `#${yourRank}` : "—"}
            </motion.p>
          </div>
          <AnimatedLeaderboardList entries={leaderboardTop} />
        </motion.div>
      )}

      {phase === "finished" && (
        <motion.div
          variants={questionCardVariants}
          initial="initial"
          animate="animate"
          className="border-border bg-card flex flex-col items-center gap-4 rounded-2xl border p-8 text-center"
        >
          <motion.div
            initial={{ scale: 0, rotate: -15 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 16,
              delay: 0.1,
            }}
          >
            <LottieEffect kind="trophy" size={56} />
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="text-lg font-semibold"
          >
            Game over!
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-muted-foreground text-sm"
          >
            Final score:{" "}
            <ResultScoreCounter
              value={totalScore}
              className="text-foreground font-mono font-semibold"
            />
          </motion.p>
          {standings.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="w-full"
            >
              <LeaderboardPodium standings={standings} />
            </motion.div>
          )}
          <Button asChild>
            <Link href={guestName ? "/play" : "/student"}>
              {guestName ? "Play another game" : "Back to Dashboard"}
            </Link>
          </Button>
        </motion.div>
      )}

      {phase === "cancelled" && (
        <motion.div
          variants={overlayVariants}
          initial="initial"
          animate="animate"
          className="border-border bg-card flex flex-col items-center gap-4 rounded-2xl border p-10 text-center"
        >
          <XCircle className="text-muted-foreground size-10" />
          <p className="font-medium">This game was ended by the host.</p>
          <Button asChild variant="secondary">
            <Link href={guestName ? "/play" : "/student"}>
              {guestName ? "Play another game" : "Back to Dashboard"}
            </Link>
          </Button>
        </motion.div>
      )}
    </div>
  );
}
