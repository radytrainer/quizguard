"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  Copy,
  Radio,
  Users,
  XCircle,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type {
  LiveLeaderboardEntry,
  LiveQuestionView,
  LiveRevealView,
  LiveRosterEntry,
} from "@/backend/live/live.schema";
import { getRealtimeSocket } from "@/features/realtime/socket-client";
import { AnimatedLeaderboardList } from "@/features/live/animated-leaderboard";
import { ConfettiBurst } from "@/features/live/animations/confetti";
import { CountdownEmphasis } from "@/features/live/animations/countdown-emphasis";
import { LottieEffect } from "@/features/live/animations/lottie-effect";
import { QuizStartSequence } from "@/features/live/animations/quiz-start-sequence";
import {
  correctPopVariants,
  optionItemVariants,
  optionListVariants,
  questionCardVariants,
  rosterItemVariants,
} from "@/features/live/animations/variants";
import {
  AVATAR_ICONS,
  getAvatarBadgeColor,
} from "@/features/live/avatar-styles";
import { LeaderboardPodium } from "@/features/live/leaderboard-podium";
import { getLiveOptionStyle } from "@/features/live/option-styles";
import { cn } from "@/lib/utils";

type Phase =
  "lobby" | "question" | "reveal" | "leaderboard" | "finished" | "cancelled";

export function LiveHostView({
  sessionId,
  quizTitle,
  joinCode,
  initialStatus,
}: {
  sessionId: string;
  quizTitle: string;
  joinCode: string;
  initialStatus: string;
}) {
  const [phase, setPhase] = useState<Phase>(initialStatus as Phase);
  const [roster, setRoster] = useState<LiveRosterEntry[]>([]);
  const [question, setQuestion] = useState<LiveQuestionView | null>(null);
  const [answered, setAnswered] = useState(0);
  const [reveal, setReveal] = useState<LiveRevealView | null>(null);
  const [leaderboard, setLeaderboard] = useState<LiveLeaderboardEntry[]>([]);
  const [standings, setStandings] = useState<LiveLeaderboardEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  // Purely cosmetic, local-only state — see the matching comment in live-player-view.tsx for
  // why none of this ever feeds back into the real session/timer logic.
  const [showStartSequence, setShowStartSequence] = useState(false);
  const [revealBurst, setRevealBurst] = useState(0);
  const [finishedBurst, setFinishedBurst] = useState(0);
  const startSequenceShownRef = useRef(false);
  const finishedCelebratedRef = useRef(false);
  // `useSyncExternalStore`, not a lazy `useState` initializer reading `window` directly — the
  // server snapshot ("") and the client's snapshot (the real origin) are allowed to differ by
  // design here, which is exactly the mismatch a lazy initializer can't express safely: reading
  // `window` directly in that initializer would make the client's very first (pre-hydration)
  // render already disagree with the server about whether the QR-code block below exists at
  // all — a hydration error severe enough that React discards and rebuilds this entire subtree
  // (confirmed live: this was firing on every load of this page before this fix, tearing down
  // and replaying every entrance animation in it along with it).
  const origin = useSyncExternalStore(
    () => () => {}, // nothing to subscribe to — the origin never changes for a loaded tab
    () => window.location.origin,
    () => "",
  );

  useEffect(() => {
    const socket = getRealtimeSocket();

    function join() {
      socket.emit("live:join", { sessionId });
    }
    function onRoster(payload: LiveRosterEntry[]) {
      setRoster(payload);
    }
    function onQuestion(payload: LiveQuestionView) {
      setQuestion(payload);
      setAnswered(0);
      setReveal(null);
      setPhase("question");
      if (payload.questionIndex === 0 && !startSequenceShownRef.current) {
        startSequenceShownRef.current = true;
        setShowStartSequence(true);
      }
    }
    function onAnswerCount(payload: { answered: number; total: number }) {
      setAnswered(payload.answered);
    }
    function onReveal(payload: LiveRevealView) {
      setReveal(payload);
      setPhase("reveal");
      setRevealBurst((n) => n + 1);
    }
    function onLeaderboard(payload: { top: LiveLeaderboardEntry[] }) {
      setLeaderboard(payload.top);
      setPhase("leaderboard");
    }
    function onFinished(payload: { standings: LiveLeaderboardEntry[] }) {
      setStandings(payload.standings);
      setPhase("finished");
    }
    function onEnded() {
      setPhase("cancelled");
    }
    function onError(message: string) {
      setError(message);
    }

    if (socket.connected) join();
    socket.on("connect", join);
    socket.on("live:roster", onRoster);
    socket.on("live:question", onQuestion);
    socket.on("live:answer_count", onAnswerCount);
    socket.on("live:reveal", onReveal);
    socket.on("live:leaderboard", onLeaderboard);
    socket.on("live:finished", onFinished);
    socket.on("live:ended", onEnded);
    socket.on("live:error", onError);

    return () => {
      socket.off("connect", join);
      socket.off("live:roster", onRoster);
      socket.off("live:question", onQuestion);
      socket.off("live:answer_count", onAnswerCount);
      socket.off("live:reveal", onReveal);
      socket.off("live:leaderboard", onLeaderboard);
      socket.off("live:finished", onFinished);
      socket.off("live:ended", onEnded);
      socket.off("live:error", onError);
    };
  }, [sessionId]);

  // Countdown ticks locally for display only — the server's own timer is what actually reveals.
  useEffect(() => {
    if (phase !== "question") return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [phase]);

  // The one-shot "final results" celebration — guarded so a re-render never fires it twice.
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

  function act(event: string) {
    getRealtimeSocket().emit(event, { sessionId });
  }

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied (no permission, insecure context) — the code is still
      // right there on screen to copy by hand.
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {showStartSequence && (
        <QuizStartSequence onDone={() => setShowStartSequence(false)} />
      )}
      <ConfettiBurst trigger={revealBurst} />
      <ConfettiBurst trigger={finishedBurst} />

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{quizTitle}</h1>
          <p className="text-muted-foreground text-sm">Live game</p>
        </div>
        {phase !== "finished" && phase !== "cancelled" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => act("live:host_cancel")}
          >
            End Game
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {phase === "lobby" && (
        <motion.div
          variants={questionCardVariants}
          initial="initial"
          animate="animate"
          className="border-border bg-card flex flex-col gap-6 rounded-2xl border p-6 sm:p-8"
        >
          <div className="sm:divide-border grid grid-cols-1 gap-6 sm:grid-cols-2 sm:divide-x">
            <div className="flex flex-col items-center gap-4 text-center">
              <div>
                <p className="text-muted-foreground text-sm tracking-wide uppercase">
                  Join code
                </p>
                <div className="flex items-center justify-center gap-2">
                  <p className="font-mono text-5xl font-bold tracking-widest">
                    {joinCode}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleCopyCode()}
                    aria-label="Copy join code"
                  >
                    {copied ? (
                      <Check className="text-success size-5" />
                    ) : (
                      <Copy className="size-5" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <Users className="text-muted-foreground size-4" />
                <span className="font-semibold">{roster.length} joined</span>
              </div>
              {roster.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  Waiting for students to join…
                </p>
              )}
            </div>

            {origin && (
              <div className="flex flex-col items-center justify-center gap-2 pt-2 text-center sm:pt-0">
                <div className="w-fit rounded-xl border bg-white p-2.5">
                  <QRCodeSVG value={`${origin}/play/${sessionId}`} size={132} />
                </div>
                <p className="text-muted-foreground text-xs">
                  Scan to join — no account needed
                </p>
                <p className="text-muted-foreground text-xs">
                  or go to <span className="font-medium">{origin}/play</span>{" "}
                  and enter the code
                </p>
              </div>
            )}
          </div>

          {roster.length > 0 && (
            <div className="grid max-h-80 grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-3 md:grid-cols-4">
              <AnimatePresence initial={false}>
                {roster.map((r) => {
                  const Icon = AVATAR_ICONS[r.avatar];
                  return (
                    <motion.div
                      key={r.participantId}
                      layout
                      variants={rosterItemVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      className="border-border flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center"
                    >
                      <span
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-full text-white",
                          getAvatarBadgeColor(r.participantId),
                        )}
                      >
                        <Icon className="size-5" />
                      </span>
                      <span className="w-full truncate text-xs font-medium">
                        {r.name}
                      </span>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}

          <Button
            size="lg"
            className="self-center"
            onClick={() => act("live:host_start")}
            disabled={roster.length === 0}
          >
            Start Game
            <ArrowRight className="size-4" />
          </Button>
        </motion.div>
      )}

      {phase === "question" && question && (
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
              className="font-mono font-semibold"
            >
              {remainingSeconds}s
            </CountdownEmphasis>
          </div>
          <Progress value={remainingPercent} className="h-2" />
          <p className="text-center text-lg font-semibold">{question.text}</p>
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
              return (
                <motion.div
                  key={option.id}
                  variants={optionItemVariants}
                  className={cn(
                    "flex items-center gap-3 rounded-xl p-4 font-medium",
                    className,
                  )}
                >
                  <Icon className="size-5 shrink-0" />
                  {option.text}
                </motion.div>
              );
            })}
          </motion.div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">
              {answered} of {roster.length} answered
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => act("live:host_reveal")}
            >
              Reveal Now
            </Button>
          </div>
        </motion.div>
      )}

      {phase === "reveal" && reveal && question && (
        <motion.div
          variants={questionCardVariants}
          initial="initial"
          animate="animate"
          className="border-border bg-card flex flex-col gap-5 rounded-2xl border p-6"
        >
          <p className="text-center text-lg font-semibold">{question.text}</p>
          <motion.div
            variants={optionListVariants}
            initial="initial"
            animate="animate"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            {question.options.map((option, i) => {
              const isCorrect = reveal.correctOptionIds.includes(option.id);
              const picks = reveal.distribution[option.id] ?? 0;
              const { Icon, className } = getLiveOptionStyle(
                question.questionIndex,
                i,
              );
              return (
                <motion.div
                  key={option.id}
                  variants={isCorrect ? correctPopVariants : optionItemVariants}
                  animate={isCorrect ? "pop" : undefined}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-xl p-4 font-medium",
                    className,
                    !isCorrect && "opacity-50",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="size-5 shrink-0" />
                    {option.text}
                    {isCorrect && <CheckCircle2 className="size-4" />}
                  </span>
                  <span className="font-mono">{picks}</span>
                </motion.div>
              );
            })}
          </motion.div>
          <p className="text-muted-foreground text-center text-sm">
            {reveal.totalAnswered} of {reveal.totalParticipants} answered
          </p>
          <Button
            size="lg"
            onClick={() => act("live:host_leaderboard")}
            className="self-center"
          >
            <BarChart3 className="size-4" />
            Show Leaderboard
          </Button>
        </motion.div>
      )}

      {phase === "leaderboard" && (
        <motion.div
          variants={questionCardVariants}
          initial="initial"
          animate="animate"
          className="border-border bg-card flex flex-col gap-5 rounded-2xl border p-6"
        >
          <h2 className="text-center text-lg font-semibold">Leaderboard</h2>
          {leaderboard.length === 0 ? (
            <p className="text-muted-foreground text-center text-sm">
              No answers yet.
            </p>
          ) : (
            <AnimatedLeaderboardList entries={leaderboard} />
          )}
          <Button
            size="lg"
            onClick={() => act("live:host_next")}
            className="self-center"
          >
            Next Question
            <ArrowRight className="size-4" />
          </Button>
        </motion.div>
      )}

      {phase === "finished" && (
        <motion.div
          variants={questionCardVariants}
          initial="initial"
          animate="animate"
          className="border-border bg-card flex flex-col gap-5 rounded-2xl border p-6"
        >
          <div className="flex flex-col items-center gap-2 text-center">
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
            <h2 className="text-lg font-semibold">Final Results</h2>
          </div>
          <LeaderboardPodium standings={standings} />
          <Button asChild size="lg" className="self-center">
            <Link href="/teacher/live">Back to Live Games</Link>
          </Button>
        </motion.div>
      )}

      {phase === "cancelled" && (
        <motion.div
          variants={questionCardVariants}
          initial="initial"
          animate="animate"
          className="border-border bg-card flex flex-col items-center gap-4 rounded-2xl border p-10 text-center"
        >
          <XCircle className="text-muted-foreground size-10" />
          <p className="text-lg font-semibold">This game was ended.</p>
          <Button asChild variant="secondary">
            <Link href="/teacher/live">Back to Live Games</Link>
          </Button>
        </motion.div>
      )}

      {![
        "lobby",
        "question",
        "reveal",
        "leaderboard",
        "finished",
        "cancelled",
      ].includes(phase) && (
        <div className="border-border bg-card flex items-center justify-center gap-2 rounded-2xl border p-10">
          <Radio className="text-muted-foreground size-5 animate-pulse" />
          <span className="text-muted-foreground text-sm">Connecting…</span>
        </div>
      )}
    </div>
  );
}
