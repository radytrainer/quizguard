// Deliberately no "server-only" guard — this module is imported directly by
// src/realtime/server.ts, a plain Node process outside Next's bundler, same portability
// discipline as backend/auth/password.ts and backend/realtime/realtime-event.schema.ts.
import { randomInt } from "node:crypto";

import { and, count, desc, eq, inArray, sql } from "drizzle-orm";

import { conflict, forbidden, notFound } from "@/lib/api-response";
import { db } from "@/lib/db";
import {
  classStudents,
  liveSessionAnswers,
  liveSessionParticipants,
  liveSessions,
  questionOptions,
  questions,
  quizQuestions,
  quizzes,
  users,
  type LiveSession,
  type LiveSessionParticipant,
} from "@/database/schema";
import { computeSpeedPoints } from "@/backend/live/live-scoring";
import {
  LIVE_QUESTION_TYPES,
  type CreateLiveSessionInput,
  type LiveLeaderboardEntry,
  type LiveOptionView,
  type LiveQuestionView,
  type LiveRevealView,
  type LiveRosterEntry,
  type LiveStateSync,
} from "@/backend/live/live.schema";

export { computeSpeedPoints };

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function requireSession(sessionId: string): Promise<LiveSession> {
  const [session] = await db
    .select()
    .from(liveSessions)
    .where(eq(liveSessions.id, sessionId))
    .limit(1);
  if (!session) throw notFound("Live session not found");
  return session;
}

async function generateJoinCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = String(randomInt(100000, 1000000));
    const [existing] = await db
      .select({ id: liveSessions.id })
      .from(liveSessions)
      .where(
        and(
          eq(liveSessions.joinCode, code),
          sql`${liveSessions.status} not in ('finished', 'cancelled')`,
        ),
      )
      .limit(1);
    if (!existing) return code;
  }
  throw conflict("Could not generate a join code — try again");
}

export async function getQuestionView(
  session: LiveSession,
  index: number,
): Promise<LiveQuestionView> {
  const questionId = session.questionOrder[index];
  const [question] = await db
    .select()
    .from(questions)
    .where(eq(questions.id, questionId))
    .limit(1);
  if (!question) throw notFound("Question not found");

  const optionRows = await db
    .select()
    .from(questionOptions)
    .where(eq(questionOptions.questionId, questionId))
    .orderBy(questionOptions.position);

  const options: LiveOptionView[] = optionRows.map((o) => ({
    id: o.id,
    text: o.text,
  }));

  return {
    questionIndex: index,
    totalQuestions: session.questionOrder.length,
    questionId,
    type: question.type,
    text: question.text,
    options,
    timeLimitSeconds: session.timeLimitSeconds,
    startedAt: (session.currentQuestionStartedAt ?? new Date()).toISOString(),
  };
}

export async function createLiveSession(
  hostId: string,
  quizId: string,
  input: CreateLiveSessionInput,
): Promise<LiveSession> {
  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, quizId))
    .limit(1);
  if (!quiz || quiz.deletedAt) throw notFound("Quiz not found");
  if (quiz.status !== "published") {
    throw conflict("Only published quizzes can be hosted live");
  }

  const pool = await db
    .select({
      questionId: quizQuestions.questionId,
      position: quizQuestions.position,
    })
    .from(quizQuestions)
    .innerJoin(questions, eq(questions.id, quizQuestions.questionId))
    .where(
      and(
        eq(quizQuestions.quizId, quizId),
        inArray(questions.type, LIVE_QUESTION_TYPES),
      ),
    )
    .orderBy(quizQuestions.position);
  if (pool.length === 0) {
    throw conflict(
      "This quiz has no multiple-choice, true/false, or multiple-answer questions to host live",
    );
  }

  const questionCount = Math.min(quiz.questionsPerAttempt, pool.length);
  const selected = (quiz.randomizeQuestions ? shuffle(pool) : pool).slice(
    0,
    questionCount,
  );

  const joinCode = await generateJoinCode();

  const [session] = await db
    .insert(liveSessions)
    .values({
      quizId,
      hostId,
      classId: input.classId ?? null,
      joinCode,
      questionOrder: selected.map((row) => row.questionId),
      timeLimitSeconds: input.timeLimitSeconds,
    })
    .returning();

  return session;
}

export async function getSessionByJoinCode(joinCode: string): Promise<{
  session: LiveSession;
  quizTitle: string;
  hostName: string;
}> {
  const [row] = await db
    .select({
      session: liveSessions,
      quizTitle: quizzes.title,
      hostName: users.name,
    })
    .from(liveSessions)
    .innerJoin(quizzes, eq(quizzes.id, liveSessions.quizId))
    .innerJoin(users, eq(users.id, liveSessions.hostId))
    .where(
      and(
        eq(liveSessions.joinCode, joinCode),
        sql`${liveSessions.status} not in ('finished', 'cancelled')`,
      ),
    )
    .limit(1);
  if (!row) throw notFound("No active game with that code");
  return row;
}

export async function joinSession(
  sessionId: string,
  studentId: string,
): Promise<LiveSessionParticipant> {
  const session = await requireSession(sessionId);
  if (session.status === "finished" || session.status === "cancelled") {
    throw conflict("This game has already ended");
  }

  if (session.classId) {
    const [enrolled] = await db
      .select({ studentId: classStudents.studentId })
      .from(classStudents)
      .where(
        and(
          eq(classStudents.classId, session.classId),
          eq(classStudents.studentId, studentId),
        ),
      )
      .limit(1);
    if (!enrolled) {
      throw forbidden("This game is restricted to a specific class");
    }
  }

  await db
    .insert(liveSessionParticipants)
    .values({ sessionId, studentId })
    .onConflictDoNothing({
      target: [
        liveSessionParticipants.sessionId,
        liveSessionParticipants.studentId,
      ],
    });

  const [participant] = await db
    .select()
    .from(liveSessionParticipants)
    .where(
      and(
        eq(liveSessionParticipants.sessionId, sessionId),
        eq(liveSessionParticipants.studentId, studentId),
      ),
    )
    .limit(1);
  return participant;
}

export async function getRoster(sessionId: string): Promise<LiveRosterEntry[]> {
  return db
    .select({
      participantId: liveSessionParticipants.id,
      studentId: liveSessionParticipants.studentId,
      name: users.name,
    })
    .from(liveSessionParticipants)
    .innerJoin(users, eq(users.id, liveSessionParticipants.studentId))
    .where(eq(liveSessionParticipants.sessionId, sessionId))
    .orderBy(users.name);
}

export async function startSession(
  sessionId: string,
): Promise<{ session: LiveSession; question: LiveQuestionView }> {
  const session = await requireSession(sessionId);
  if (session.status !== "lobby") {
    throw conflict("This game has already started");
  }

  const [updated] = await db
    .update(liveSessions)
    .set({
      status: "question",
      currentQuestionIndex: 0,
      currentQuestionStartedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(liveSessions.id, sessionId))
    .returning();

  const question = await getQuestionView(updated, 0);
  return { session: updated, question };
}

export async function submitAnswer(
  sessionId: string,
  studentId: string,
  questionIndex: number,
  selectedOptionIds: string[],
): Promise<void> {
  const session = await requireSession(sessionId);
  if (session.status !== "question") {
    throw conflict("This question is no longer accepting answers");
  }
  if (session.currentQuestionIndex !== questionIndex) {
    throw conflict("This question is no longer active");
  }

  const [participant] = await db
    .select()
    .from(liveSessionParticipants)
    .where(
      and(
        eq(liveSessionParticipants.sessionId, sessionId),
        eq(liveSessionParticipants.studentId, studentId),
      ),
    )
    .limit(1);
  if (!participant) throw forbidden("Join the game before answering");

  const questionId = session.questionOrder[questionIndex];
  const optionRows = await db
    .select()
    .from(questionOptions)
    .where(eq(questionOptions.questionId, questionId));

  const correctIds = new Set(
    optionRows.filter((o) => o.isCorrect).map((o) => o.id),
  );
  const selected = new Set(selectedOptionIds);
  const isCorrect =
    selected.size === correctIds.size &&
    [...selected].every((id) => correctIds.has(id));

  const elapsedMs = session.currentQuestionStartedAt
    ? Date.now() - session.currentQuestionStartedAt.getTime()
    : session.timeLimitSeconds * 1000;
  const pointsAwarded = computeSpeedPoints(
    elapsedMs,
    session.timeLimitSeconds * 1000,
    isCorrect,
  );

  const inserted = await db
    .insert(liveSessionAnswers)
    .values({
      sessionId,
      participantId: participant.id,
      questionId,
      questionIndex,
      selectedOptionIds,
      isCorrect,
      pointsAwarded,
    })
    .onConflictDoNothing({
      target: [
        liveSessionAnswers.participantId,
        liveSessionAnswers.questionIndex,
      ],
    })
    .returning({ id: liveSessionAnswers.id });
  if (inserted.length === 0) {
    throw conflict("You already answered this question");
  }

  await db
    .update(liveSessionParticipants)
    .set({ score: sql`${liveSessionParticipants.score} + ${pointsAwarded}` })
    .where(eq(liveSessionParticipants.id, participant.id));
}

export async function getAnswerCount(
  sessionId: string,
  questionIndex: number,
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(liveSessionAnswers)
    .where(
      and(
        eq(liveSessionAnswers.sessionId, sessionId),
        eq(liveSessionAnswers.questionIndex, questionIndex),
      ),
    );
  return row.total;
}

export async function revealAnswer(sessionId: string): Promise<LiveRevealView> {
  const session = await requireSession(sessionId);
  const index = session.currentQuestionIndex ?? 0;

  if (session.status === "question") {
    await db
      .update(liveSessions)
      .set({ status: "reveal", updatedAt: new Date() })
      .where(eq(liveSessions.id, sessionId));
  }

  const questionId = session.questionOrder[index];
  const optionRows = await db
    .select()
    .from(questionOptions)
    .where(eq(questionOptions.questionId, questionId));
  const correctOptionIds = optionRows
    .filter((o) => o.isCorrect)
    .map((o) => o.id);

  const answers = await db
    .select()
    .from(liveSessionAnswers)
    .where(
      and(
        eq(liveSessionAnswers.sessionId, sessionId),
        eq(liveSessionAnswers.questionIndex, index),
      ),
    );

  const distribution: Record<string, number> = {};
  for (const answer of answers) {
    for (const optionId of answer.selectedOptionIds) {
      distribution[optionId] = (distribution[optionId] ?? 0) + 1;
    }
  }

  const [{ total: totalParticipants }] = await db
    .select({ total: count() })
    .from(liveSessionParticipants)
    .where(eq(liveSessionParticipants.sessionId, sessionId));

  return {
    questionIndex: index,
    correctOptionIds,
    distribution,
    totalAnswered: answers.length,
    totalParticipants,
  };
}

export interface ParticipantResult {
  isCorrect: boolean;
  pointsAwarded: number;
  totalScore: number;
}

/** Keyed by participantId — used to fan out a private live:your_result to each socket. */
export async function getParticipantResults(
  sessionId: string,
  questionIndex: number,
): Promise<Map<string, ParticipantResult>> {
  const rows = await db
    .select({
      participantId: liveSessionAnswers.participantId,
      isCorrect: liveSessionAnswers.isCorrect,
      pointsAwarded: liveSessionAnswers.pointsAwarded,
      totalScore: liveSessionParticipants.score,
    })
    .from(liveSessionAnswers)
    .innerJoin(
      liveSessionParticipants,
      eq(liveSessionParticipants.id, liveSessionAnswers.participantId),
    )
    .where(
      and(
        eq(liveSessionAnswers.sessionId, sessionId),
        eq(liveSessionAnswers.questionIndex, questionIndex),
      ),
    );

  return new Map(rows.map((row) => [row.participantId, row]));
}

async function rankedParticipants(sessionId: string) {
  return db
    .select({
      participantId: liveSessionParticipants.id,
      name: users.name,
      score: liveSessionParticipants.score,
    })
    .from(liveSessionParticipants)
    .innerJoin(users, eq(users.id, liveSessionParticipants.studentId))
    .where(eq(liveSessionParticipants.sessionId, sessionId))
    .orderBy(desc(liveSessionParticipants.score));
}

export async function showLeaderboard(sessionId: string): Promise<{
  top: LiveLeaderboardEntry[];
  ranks: Map<string, number>;
}> {
  await db
    .update(liveSessions)
    .set({ status: "leaderboard", updatedAt: new Date() })
    .where(eq(liveSessions.id, sessionId));

  const rows = await rankedParticipants(sessionId);

  const ranks = new Map<string, number>();
  const top: LiveLeaderboardEntry[] = [];
  rows.forEach((row, i) => {
    const rank = i + 1;
    ranks.set(row.participantId, rank);
    if (i < 5) top.push({ ...row, rank });
  });

  return { top, ranks };
}

export async function finishSession(
  sessionId: string,
): Promise<LiveLeaderboardEntry[]> {
  await db
    .update(liveSessions)
    .set({ status: "finished", endedAt: new Date(), updatedAt: new Date() })
    .where(eq(liveSessions.id, sessionId));

  const rows = await rankedParticipants(sessionId);
  return rows.map((row, i) => ({ ...row, rank: i + 1 }));
}

export async function cancelSession(sessionId: string): Promise<void> {
  await db
    .update(liveSessions)
    .set({ status: "cancelled", endedAt: new Date(), updatedAt: new Date() })
    .where(eq(liveSessions.id, sessionId));
}

export async function advanceQuestion(
  sessionId: string,
): Promise<
  | { finished: true; standings: LiveLeaderboardEntry[] }
  | { finished: false; question: LiveQuestionView }
> {
  const session = await requireSession(sessionId);
  const nextIndex = (session.currentQuestionIndex ?? -1) + 1;

  if (nextIndex >= session.questionOrder.length) {
    const standings = await finishSession(sessionId);
    return { finished: true, standings };
  }

  const [updated] = await db
    .update(liveSessions)
    .set({
      status: "question",
      currentQuestionIndex: nextIndex,
      currentQuestionStartedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(liveSessions.id, sessionId))
    .returning();

  const question = await getQuestionView(updated, nextIndex);
  return { finished: false, question };
}

export async function getSessionState(
  sessionId: string,
  studentId: string,
): Promise<LiveStateSync> {
  const session = await requireSession(sessionId);
  const [quiz] = await db
    .select({ title: quizzes.title })
    .from(quizzes)
    .where(eq(quizzes.id, session.quizId))
    .limit(1);

  let currentQuestion: LiveQuestionView | null = null;
  let alreadyAnswered = false;

  const [participant] = await db
    .select({
      id: liveSessionParticipants.id,
      score: liveSessionParticipants.score,
    })
    .from(liveSessionParticipants)
    .where(
      and(
        eq(liveSessionParticipants.sessionId, sessionId),
        eq(liveSessionParticipants.studentId, studentId),
      ),
    )
    .limit(1);

  if (session.status === "question" && session.currentQuestionIndex !== null) {
    currentQuestion = await getQuestionView(
      session,
      session.currentQuestionIndex,
    );

    if (participant) {
      const [answer] = await db
        .select({ id: liveSessionAnswers.id })
        .from(liveSessionAnswers)
        .where(
          and(
            eq(liveSessionAnswers.participantId, participant.id),
            eq(liveSessionAnswers.questionIndex, session.currentQuestionIndex),
          ),
        )
        .limit(1);
      alreadyAnswered = Boolean(answer);
    }
  }

  return {
    status: session.status,
    quizTitle: quiz?.title ?? "",
    hostId: session.hostId,
    timeLimitSeconds: session.timeLimitSeconds,
    currentQuestion,
    alreadyAnswered,
    score: participant?.score ?? 0,
  };
}

export interface LiveSessionResults {
  quizTitle: string;
  status: string;
  totalQuestions: number;
  standings: LiveLeaderboardEntry[];
}

export async function getSessionResults(
  sessionId: string,
): Promise<LiveSessionResults> {
  const session = await requireSession(sessionId);
  const [quiz] = await db
    .select({ title: quizzes.title })
    .from(quizzes)
    .where(eq(quizzes.id, session.quizId))
    .limit(1);

  const rows = await rankedParticipants(sessionId);

  return {
    quizTitle: quiz?.title ?? "",
    status: session.status,
    totalQuestions: session.questionOrder.length,
    standings: rows.map((row, i) => ({ ...row, rank: i + 1 })),
  };
}

export interface LiveSessionListItem {
  id: string;
  quizTitle: string;
  status: string;
  joinCode: string;
  participantCount: number;
  createdAt: Date;
}

export async function listSessionsForHost(
  hostId: string,
): Promise<LiveSessionListItem[]> {
  return db
    .select({
      id: liveSessions.id,
      quizTitle: quizzes.title,
      status: liveSessions.status,
      joinCode: liveSessions.joinCode,
      createdAt: liveSessions.createdAt,
      participantCount:
        sql<number>`count(${liveSessionParticipants.id})`.mapWith(Number),
    })
    .from(liveSessions)
    .innerJoin(quizzes, eq(quizzes.id, liveSessions.quizId))
    .leftJoin(
      liveSessionParticipants,
      eq(liveSessionParticipants.sessionId, liveSessions.id),
    )
    .where(eq(liveSessions.hostId, hostId))
    .groupBy(liveSessions.id, quizzes.title)
    .orderBy(desc(liveSessions.createdAt));
}
