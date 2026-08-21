/**
 * Load-tests the standalone realtime server (src/realtime/server.ts) — connects one teacher
 * socket watching the load-test quiz's room, then N student sockets joining their own attempt
 * concurrently, and measures how long the connection handshake (which does a Redis session
 * lookup per socket — see backend/auth/session-lookup.ts) takes under concurrency, plus how
 * promptly and completely the teacher's presence broadcast reflects all of them.
 *
 * Reuses existing historical attempts from seed.ts rather than starting new ones — join:attempt
 * only checks DB ownership, not attempt status, so any seeded attempt works as a connection
 * target. Requires the realtime server to be running (`pnpm realtime:dev` or equivalent) in
 * addition to the seed data.
 */
import { and, eq, isNull } from "drizzle-orm";
import { io, type Socket } from "socket.io-client";

import { db, pool } from "@/lib/db";
import { examAttempts, quizzes, users } from "@/database/schema";
import { env } from "@/lib/env";
import {
  LOAD_TEST_PASSWORD,
  LOAD_TEST_QUIZ_TITLE,
  LOAD_TEST_STUDENT_COUNT,
  LOAD_TEST_TEACHER_EMAIL,
} from "./config";

const CONCURRENCY = Number(process.argv[2] ?? LOAD_TEST_STUDENT_COUNT);
const APP_URL = env.APP_URL;
const REALTIME_URL =
  process.env.NEXT_PUBLIC_REALTIME_URL ??
  `http://localhost:${env.REALTIME_PORT}`;

async function loginCookie(email: string, ip: string): Promise<string> {
  const res = await fetch(`${APP_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ email, password: LOAD_TEST_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status}`);
  const setCookie = res.headers.getSetCookie()[0];
  const cookie = setCookie?.split(";")[0];
  if (!cookie) throw new Error(`no session cookie for ${email}`);
  return cookie;
}

function connectSocket(
  cookie: string,
): Promise<{ socket: Socket; connectMs: number }> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const socket = io(REALTIME_URL, {
      extraHeaders: { cookie },
      reconnection: false,
      timeout: 15_000,
    });
    socket.once("connect", () => {
      resolve({ socket, connectMs: performance.now() - start });
    });
    socket.once("connect_error", (err) => {
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length),
  );
  return sorted[index];
}

async function main() {
  const [teacher] = await db
    .select()
    .from(users)
    .where(eq(users.email, LOAD_TEST_TEACHER_EMAIL))
    .limit(1);
  if (!teacher) {
    throw new Error(
      "Load test teacher not found — run `pnpm tsx scripts/load-test/seed.ts` first",
    );
  }
  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(
      and(
        eq(quizzes.title, LOAD_TEST_QUIZ_TITLE),
        eq(quizzes.createdBy, teacher.id),
        isNull(quizzes.deletedAt),
      ),
    )
    .limit(1);
  if (!quiz) {
    throw new Error(
      "Load test quiz not found — run `pnpm tsx scripts/load-test/seed.ts` first",
    );
  }

  const attempts = await db
    .select({ id: examAttempts.id, studentId: examAttempts.studentId })
    .from(examAttempts)
    .where(eq(examAttempts.quizId, quiz.id))
    .limit(CONCURRENCY);
  if (attempts.length === 0) {
    throw new Error(
      "No historical attempts found — run `pnpm tsx scripts/load-test/seed.ts` first",
    );
  }

  const studentEmails = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.role, "student"));
  const emailById = new Map(studentEmails.map((s) => [s.id, s.email]));

  console.log(
    `Connecting 1 teacher + ${attempts.length} students to ${REALTIME_URL} for quiz "${quiz.title}"...`,
  );

  const teacherCookie = await loginCookie(LOAD_TEST_TEACHER_EMAIL, "10.9.0.1");
  const { socket: teacherSocket } = await connectSocket(teacherCookie);
  let presenceUpdates = 0;
  let lastPresenceSize = 0;
  teacherSocket.on("presence:update", (list: unknown[]) => {
    presenceUpdates += 1;
    lastPresenceSize = list.length;
  });
  teacherSocket.emit("join:quiz", quiz.id);

  const connectMsList: number[] = [];
  let connectErrors = 0;

  const wallStart = performance.now();
  const studentSockets = await Promise.all(
    attempts.map(async (attempt) => {
      const email = emailById.get(attempt.studentId);
      if (!email) return null;
      try {
        const cookie = await loginCookie(
          email,
          `10.9.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        );
        const { socket, connectMs } = await connectSocket(cookie);
        connectMsList.push(connectMs);
        socket.emit("join:attempt", attempt.id);
        return socket;
      } catch {
        connectErrors += 1;
        return null;
      }
    }),
  );

  // Give the last presence:update broadcasts time to arrive after the last join:attempt fires.
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  const wallMs = performance.now() - wallStart;

  const sorted = [...connectMsList].sort((a, b) => a - b);
  const avg = sorted.length
    ? sorted.reduce((a, b) => a + b, 0) / sorted.length
    : 0;
  console.log(
    `\nAll students connected + joined in ${(wallMs / 1000).toFixed(1)}s wall time.\n`,
  );
  console.log(
    `connect        n=${sorted.length}  avg=${avg.toFixed(0)}ms  p50=${percentile(sorted, 50).toFixed(0)}ms  ` +
      `p95=${percentile(sorted, 95).toFixed(0)}ms  p99=${percentile(sorted, 99).toFixed(0)}ms  ` +
      `max=${sorted.at(-1)?.toFixed(0) ?? "0"}ms  errors=${connectErrors}`,
  );
  console.log(
    `Teacher received ${presenceUpdates} presence:update broadcasts; final presence list size ${lastPresenceSize} (expected ${attempts.length}).`,
  );

  teacherSocket.disconnect();
  for (const socket of studentSockets) socket?.disconnect();
}

main()
  .catch((error: unknown) => {
    console.error("Realtime connection load test failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    process.exit(process.exitCode ?? 0);
  });
