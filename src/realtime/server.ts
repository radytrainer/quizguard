/**
 * A standalone Node process, not part of the Next.js app — Next 16's `output: "standalone"`
 * build produces its own generated server.js and explicitly cannot be combined with a
 * hand-written custom server (confirmed against `node_modules/next/dist/docs/01-app/02-guides
 * /custom-server.md`), and Route Handlers only expose the Web Request/Response API, with no
 * documented way to reach the underlying raw socket the way the old Pages Router
 * `res.socket.server` trick did. So this is its own process, its own port, run alongside
 * `next dev` in development (see package.json's `realtime:dev` script) — see
 * docs/ARCHITECTURE.md, Section 12 for the full reasoning and the production deployment note.
 *
 * Every module it imports (env, redis, db, schema, session-lookup, the realtime event schema)
 * is deliberately free of `"server-only"` guards and `next/*` imports for exactly this reason —
 * same pattern as backend/auth/password.ts and the database seed scripts.
 */
import { createServer } from "node:http";

import { eq } from "drizzle-orm";
import { Redis } from "ioredis";
import { Server as SocketIOServer, type Socket } from "socket.io";

import {
  getUserBySessionToken,
  type AuthUser,
} from "@/backend/auth/session-lookup";
import {
  liveAnswerSchema,
  liveHostActionSchema,
  liveJoinSchema,
} from "@/backend/live/live.schema";
import {
  advanceQuestion,
  cancelSession,
  getAnswerCount,
  getParticipantResults,
  getQuestionView,
  getRoster,
  getSessionState,
  joinSession,
  joinSessionAsGuest,
  requireSession,
  revealAnswer,
  showLeaderboard,
  startSession,
  submitAnswer,
} from "@/backend/live/live.service";
import {
  REALTIME_CHANNEL,
  realtimeEventSchema,
} from "@/backend/realtime/realtime-event.schema";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { examAttempts, type LiveSession } from "@/database/schema";

// Duplicated from backend/auth/session.ts rather than imported — that module is guarded by
// `"server-only"`, which throws unconditionally outside Next's bundler. Same reasoning as
// src/proxy.ts, which duplicates this exact constant for the same cross-boundary reason.
const SESSION_COOKIE_NAME = "qg_session";

function parseCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return undefined;
}

interface PresenceEntry {
  attemptId: string;
  studentId: string;
  studentName: string;
}

// quizId -> attemptId -> presence entry. In-memory, single-process — fine for one realtime
// server instance; horizontal scaling of this process (if load testing ever calls for it) is a
// Phase 12 concern, not solved speculatively here.
const presence = new Map<string, Map<string, PresenceEntry>>();

function presenceList(quizId: string): PresenceEntry[] {
  return [...(presence.get(quizId)?.values() ?? [])];
}

function addPresence(quizId: string, entry: PresenceEntry) {
  const forQuiz = presence.get(quizId) ?? new Map<string, PresenceEntry>();
  forQuiz.set(entry.attemptId, entry);
  presence.set(quizId, forQuiz);
}

function removePresence(quizId: string, attemptId: string) {
  presence.get(quizId)?.delete(attemptId);
}

// sessionId -> pending auto-reveal timeout. In-memory, single-process — same accepted
// limitation as the presence map above.
const revealTimers = new Map<string, NodeJS.Timeout>();

function clearAutoReveal(sessionId: string) {
  const timer = revealTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    revealTimers.delete(sessionId);
  }
}

function scheduleAutoReveal(sessionId: string, delayMs: number) {
  clearAutoReveal(sessionId);
  revealTimers.set(
    sessionId,
    setTimeout(() => void triggerReveal(sessionId), delayMs),
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

// Sends each connected socket in the room only the slice of `byParticipantId` addressed to it
// (its own grade, its own rank) — every socket that joined via `live:join` carries its
// participant id in `socket.data`, set at join time.
function fanOutToParticipants<T>(
  io: SocketIOServer,
  sessionId: string,
  byParticipantId: Map<string, T>,
  event: string,
) {
  const room = io.sockets.adapter.rooms.get(`live:${sessionId}`);
  if (!room) return;
  for (const socketId of room) {
    const target = io.sockets.sockets.get(socketId);
    const participantId = target?.data.liveParticipantId as string | undefined;
    if (!participantId) continue;
    const payload = byParticipantId.get(participantId);
    if (payload !== undefined) target?.emit(event, payload);
  }
}

// Host-only guard for every live:host_* action — verifies the caller is a teacher/admin AND
// (unless admin) the specific host who created this session. Never trust a client-asserted
// session ownership claim.
async function requireHost(
  socket: Socket,
  sessionId: string,
): Promise<LiveSession | null> {
  const user = socket.data.user as AuthUser | null;
  if (!user || (user.role !== "teacher" && user.role !== "admin")) return null;
  try {
    const session = await requireSession(sessionId);
    if (session.hostId !== user.id && user.role !== "admin") return null;
    return session;
  } catch {
    return null;
  }
}

const httpServer = createServer();
const io = new SocketIOServer(httpServer, {
  cors: { origin: env.APP_URL, credentials: true },
});

// Closes the answering window for the current question — called either by the host's manual
// "reveal" action or by the auto-reveal timeout, whichever comes first (also triggered early
// once every joined participant has answered — see the live:answer handler). Safe to call twice
// for the same question (the timer and an early manual reveal can race); revealAnswer() itself
// only flips status out of "question" once, so a second call just re-reads the same result.
async function triggerReveal(sessionId: string) {
  clearAutoReveal(sessionId);
  try {
    const reveal = await revealAnswer(sessionId);
    const results = await getParticipantResults(
      sessionId,
      reveal.questionIndex,
    );
    const withIndex = new Map(
      [...results].map(([id, r]) => [
        id,
        { questionIndex: reveal.questionIndex, ...r },
      ]),
    );
    io.to(`live:${sessionId}`).emit("live:reveal", reveal);
    fanOutToParticipants(io, sessionId, withIndex, "live:your_result");
  } catch (err) {
    io.to(`live:${sessionId}`).emit("live:error", errorMessage(err));
  }
}

// Unlike every other feature here, a live game's "anyone with the code" mode (Section: guest
// play, host-setup-form.tsx) is reachable with no session cookie at all — so this middleware no
// longer rejects a missing/invalid token outright, it just leaves `socket.data.user` unset.
// Every handler below that needs a real account (monitoring presence, exam-attempt presence,
// hosting) checks for that itself; only `live:join`/`live:answer` accept a null user, and only
// down the guest branch.
io.use(async (socket, next) => {
  const token = parseCookie(
    socket.handshake.headers.cookie,
    SESSION_COOKIE_NAME,
  );
  socket.data.user = token ? await getUserBySessionToken(token) : null;
  next();
});

io.on("connection", (socket: Socket) => {
  const user = socket.data.user as AuthUser | null;

  // Teacher/admin: watch a quiz's live activity (presence + events).
  socket.on("join:quiz", (quizId: unknown) => {
    if (!user || (user.role !== "teacher" && user.role !== "admin")) return;
    if (typeof quizId !== "string") return;
    void socket.join(`quiz:${quizId}`);
    socket.emit("presence:snapshot", presenceList(quizId));
  });

  // Student: announce presence on their own attempt, verified server-side against the DB —
  // never trust a client-asserted quizId/studentId pairing here.
  socket.on("join:attempt", async (attemptId: unknown) => {
    if (!user || user.role !== "student") return;
    if (typeof attemptId !== "string") return;

    const [attempt] = await db
      .select({
        quizId: examAttempts.quizId,
        studentId: examAttempts.studentId,
      })
      .from(examAttempts)
      .where(eq(examAttempts.id, attemptId))
      .limit(1);
    if (!attempt || attempt.studentId !== user.id) return;

    socket.data.quizId = attempt.quizId;
    socket.data.attemptId = attemptId;
    void socket.join(`attempt:${attemptId}`);

    const entry: PresenceEntry = {
      attemptId,
      studentId: user.id,
      studentName: user.name,
    };
    addPresence(attempt.quizId, entry);
    io.to(`quiz:${attempt.quizId}`).emit(
      "presence:update",
      presenceList(attempt.quizId),
    );
  });

  // Explicit leave (attempt finished, student navigated away) — distinct from `disconnect`
  // since the browser's socket is a shared singleton (features/realtime/socket-client.ts) that
  // stays connected across client-side navigation, so it won't naturally disconnect just
  // because one attempt ended.
  socket.on("leave:attempt", (attemptId: unknown) => {
    const quizId = socket.data.quizId as string | undefined;
    if (
      !quizId ||
      typeof attemptId !== "string" ||
      socket.data.attemptId !== attemptId
    ) {
      return;
    }
    void socket.leave(`attempt:${attemptId}`);
    removePresence(quizId, attemptId);
    io.to(`quiz:${quizId}`).emit("presence:update", presenceList(quizId));
    socket.data.quizId = undefined;
    socket.data.attemptId = undefined;
  });

  socket.on("disconnect", () => {
    const quizId = socket.data.quizId as string | undefined;
    const attemptId = socket.data.attemptId as string | undefined;
    if (!quizId || !attemptId) return;
    removePresence(quizId, attemptId);
    io.to(`quiz:${quizId}`).emit("presence:update", presenceList(quizId));
  });

  // --- Live (Kahoot-style) games — host and every participant share one room. Unlike the
  // presence map above, roster membership is the persisted live_session_participants table, not
  // in-memory socket state: a brief disconnect never drops a student's progress, only their
  // live connection (they resync via live:join's live:state_sync on reconnect).

  // Shared by both join paths below (authenticated student and anonymous guest) — same
  // participant-joined side effects either way: remember which room this socket represents,
  // sync its own state, and tell the room the roster changed.
  async function announceParticipantJoin(
    sessionId: string,
    participantId: string,
  ) {
    socket.data.liveSessionId = sessionId;
    socket.data.liveParticipantId = participantId;
    void socket.join(`live:${sessionId}`);

    socket.emit(
      "live:state_sync",
      await getSessionState(sessionId, participantId),
    );
    io.to(`live:${sessionId}`).emit("live:roster", await getRoster(sessionId));
  }

  socket.on("live:join", async (payload: unknown) => {
    const parsed = liveJoinSchema.safeParse(payload);
    if (!parsed.success) return;
    const { sessionId, guestName, guestToken, avatar } = parsed.data;

    try {
      if (user?.role === "student") {
        const participant = await joinSession(sessionId, user.id, user.name);
        await announceParticipantJoin(sessionId, participant.id);
      } else if (user?.role === "teacher" || user?.role === "admin") {
        const session = await requireSession(sessionId);
        if (session.hostId !== user.id && user.role !== "admin") {
          socket.emit("live:error", "You are not the host of this game");
          return;
        }
        socket.data.liveSessionId = sessionId;
        socket.data.isLiveHost = true;
        void socket.join(`live:${sessionId}`);

        socket.emit("live:roster", await getRoster(sessionId));
        if (
          session.status === "question" &&
          session.currentQuestionIndex !== null
        ) {
          socket.emit(
            "live:question",
            await getQuestionView(session, session.currentQuestionIndex),
          );
        }
      } else if (guestName && guestToken) {
        // No account: "anyone with the code" play (host-setup-form.tsx). joinSessionAsGuest
        // itself rejects a class-restricted session — a guest can't be checked against
        // classStudents the way an enrolled student can.
        const participant = await joinSessionAsGuest(
          sessionId,
          guestToken,
          guestName,
          avatar,
        );
        await announceParticipantJoin(sessionId, participant.id);
      } else {
        socket.emit("live:error", "Enter your name to join this game.");
      }
    } catch (err) {
      socket.emit("live:error", errorMessage(err));
    }
  });

  // Answering the current question — an authenticated student or a guest, either way identified
  // by the participantId `live:join` already verified and stashed on this socket (never a role
  // check here, since a guest has no role at all). One shot per question — submitAnswer()
  // enforces that at the DB level (a unique index), this handler just surfaces the rejection.
  socket.on("live:answer", async (payload: unknown) => {
    const participantId = socket.data.liveParticipantId as string | undefined;
    if (!participantId) return;
    const parsed = liveAnswerSchema.safeParse(payload);
    if (!parsed.success) return;
    const { sessionId, questionIndex, selectedOptionIds } = parsed.data;
    if (socket.data.liveSessionId !== sessionId) return;

    try {
      await submitAnswer(
        sessionId,
        participantId,
        questionIndex,
        selectedOptionIds,
      );
      // No correctness here — Kahoot never reveals it until every player's window has closed.
      socket.emit("live:answer_ack", { questionIndex });

      const [answered, roster] = await Promise.all([
        getAnswerCount(sessionId, questionIndex),
        getRoster(sessionId),
      ]);
      io.to(`live:${sessionId}`).emit("live:answer_count", {
        answered,
        total: roster.length,
      });
      // Early reveal once everyone who joined has answered — no reason to wait out the clock.
      if (roster.length > 0 && answered >= roster.length) {
        await triggerReveal(sessionId);
      }
    } catch (err) {
      socket.emit("live:error", errorMessage(err));
    }
  });

  socket.on("live:host_start", async (payload: unknown) => {
    const parsed = liveHostActionSchema.safeParse(payload);
    if (!parsed.success) return;
    const session = await requireHost(socket, parsed.data.sessionId);
    if (!session) return;

    try {
      const { question } = await startSession(session.id);
      io.to(`live:${session.id}`).emit("live:question", question);
      scheduleAutoReveal(session.id, question.timeLimitSeconds * 1000);
    } catch (err) {
      socket.emit("live:error", errorMessage(err));
    }
  });

  // Manual early cut-off — races harmlessly with the auto-reveal timer (see triggerReveal).
  socket.on("live:host_reveal", async (payload: unknown) => {
    const parsed = liveHostActionSchema.safeParse(payload);
    if (!parsed.success) return;
    const session = await requireHost(socket, parsed.data.sessionId);
    if (!session) return;
    await triggerReveal(session.id);
  });

  socket.on("live:host_leaderboard", async (payload: unknown) => {
    const parsed = liveHostActionSchema.safeParse(payload);
    if (!parsed.success) return;
    const session = await requireHost(socket, parsed.data.sessionId);
    if (!session) return;

    try {
      const { top, ranks } = await showLeaderboard(session.id);
      io.to(`live:${session.id}`).emit("live:leaderboard", { top });
      const rankPayload = new Map(
        [...ranks].map(([participantId, rank]) => [participantId, { rank }]),
      );
      fanOutToParticipants(io, session.id, rankPayload, "live:your_rank");
    } catch (err) {
      socket.emit("live:error", errorMessage(err));
    }
  });

  socket.on("live:host_next", async (payload: unknown) => {
    const parsed = liveHostActionSchema.safeParse(payload);
    if (!parsed.success) return;
    const session = await requireHost(socket, parsed.data.sessionId);
    if (!session) return;

    try {
      const result = await advanceQuestion(session.id);
      if (result.finished) {
        clearAutoReveal(session.id);
        io.to(`live:${session.id}`).emit("live:finished", {
          standings: result.standings,
        });
      } else {
        io.to(`live:${session.id}`).emit("live:question", result.question);
        scheduleAutoReveal(session.id, result.question.timeLimitSeconds * 1000);
      }
    } catch (err) {
      socket.emit("live:error", errorMessage(err));
    }
  });

  socket.on("live:host_cancel", async (payload: unknown) => {
    const parsed = liveHostActionSchema.safeParse(payload);
    if (!parsed.success) return;
    const session = await requireHost(socket, parsed.data.sessionId);
    if (!session) return;

    clearAutoReveal(session.id);
    await cancelSession(session.id);
    io.to(`live:${session.id}`).emit("live:ended", {});
  });
});

// A dedicated ioredis connection for Pub/Sub — a subscribing client can't run other commands on
// the same connection, so this is separate from anything doing regular reads/writes.
const subscriber = new Redis(env.REDIS_URL);
void subscriber.subscribe(REALTIME_CHANNEL);
subscriber.on("message", (_channel, message) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(message);
  } catch {
    return;
  }
  const result = realtimeEventSchema.safeParse(parsed);
  if (!result.success) return;
  // Teachers watching the quiz (live monitor) and the specific student the event is about
  // (exam-attempt.tsx, e.g. an `attempt_unlocked` notification) are two different audiences in
  // two different rooms — both need it.
  io.to(`quiz:${result.data.quizId}`).emit("event", result.data);
  io.to(`attempt:${result.data.attemptId}`).emit("event", result.data);
});

httpServer.listen(env.REALTIME_PORT, () => {
  console.log(`Realtime server listening on :${env.REALTIME_PORT}`);
});
