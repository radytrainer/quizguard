/**
 * Simulates every seeded load-test student logging in and taking the load-test quiz
 * concurrently — the platform's actual critical path (Section 7/31: "150-5000+ concurrent
 * students"). Talks to the live HTTP API like a real browser would, not the service layer
 * directly, so this measures the same request path production traffic takes (route handler,
 * rate limiter, connection pool, the lot).
 *
 * The login rate limiter buckets by `x-forwarded-for` (falling back to a single shared
 * "unknown" bucket when absent — see backend routes under src/app/api/auth/login). Running
 * every simulated student through that shared bucket would throttle after 10 logins, which
 * is a local-dev-only artifact of not sitting behind a reverse proxy — production traffic
 * arrives with distinct real client IPs. This script assigns each student a distinct synthetic
 * IP via that header to test the actual exam-flow throughput rather than re-discovering the
 * login rate limit.
 *
 * Requires `pnpm tsx scripts/load-test/seed.ts` to have been run first.
 */
import { eq, and, isNull } from "drizzle-orm";

import { db, pool } from "@/lib/db";
import { quizzes, users } from "@/database/schema";
import { env } from "@/lib/env";
import {
  LOAD_TEST_PASSWORD,
  LOAD_TEST_QUIZ_TITLE,
  LOAD_TEST_STUDENT_COUNT,
  LOAD_TEST_TEACHER_EMAIL,
  studentEmail,
} from "./config";

const CONCURRENCY = Number(process.argv[2] ?? LOAD_TEST_STUDENT_COUNT);
const BASE_URL = env.APP_URL;

interface StepStats {
  name: string;
  durationsMs: number[];
  errors: number;
  statusCounts: Map<number, number>;
}

function newStats(name: string): StepStats {
  return { name, durationsMs: [], errors: 0, statusCounts: new Map() };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length),
  );
  return sorted[index];
}

function summarize(stats: StepStats): string {
  const sorted = [...stats.durationsMs].sort((a, b) => a - b);
  const avg = sorted.length
    ? sorted.reduce((a, b) => a + b, 0) / sorted.length
    : 0;
  const statusBreakdown = [...stats.statusCounts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([status, n]) => `${status}:${n}`)
    .join(" ");
  return (
    `${stats.name.padEnd(14)} n=${String(sorted.length).padStart(4)}  ` +
    `avg=${avg.toFixed(0).padStart(5)}ms  p50=${percentile(sorted, 50).toFixed(0).padStart(5)}ms  ` +
    `p95=${percentile(sorted, 95).toFixed(0).padStart(5)}ms  p99=${percentile(sorted, 99).toFixed(0).padStart(5)}ms  ` +
    `max=${sorted.at(-1)?.toFixed(0).padStart(5) ?? "0"}ms  errors=${stats.errors}` +
    (statusBreakdown ? `  [${statusBreakdown}]` : "")
  );
}

function syntheticIp(index: number): string {
  return `10.${Math.floor(index / 65536) % 256}.${Math.floor(index / 256) % 256}.${index % 256}`;
}

async function call(
  stats: StepStats,
  fn: () => Promise<Response>,
): Promise<Response> {
  const start = performance.now();
  let res: Response;
  try {
    res = await fn();
  } catch (error) {
    stats.durationsMs.push(performance.now() - start);
    stats.errors += 1;
    throw error;
  }
  stats.durationsMs.push(performance.now() - start);
  stats.statusCounts.set(
    res.status,
    (stats.statusCounts.get(res.status) ?? 0) + 1,
  );
  if (!res.ok) {
    stats.errors += 1;
    const body = await res.text().catch(() => "<no body>");
    throw new Error(`${stats.name} failed: ${res.status} ${body}`);
  }
  return res;
}

async function studentFlow(
  index: number,
  quizId: string,
  stats: Record<string, StepStats>,
) {
  const ip = syntheticIp(index);

  const loginRes = await call(stats.login, () =>
    fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({
        email: studentEmail(index),
        password: LOAD_TEST_PASSWORD,
      }),
    }),
  );
  const setCookie = loginRes.headers.getSetCookie()[0];
  const cookie = setCookie?.split(";")[0];
  if (!cookie) throw new Error("login did not set a session cookie");

  const authedFetch = (path: string, init: RequestInit = {}) =>
    fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { ...init.headers, cookie, "content-type": "application/json" },
    });

  const startRes = await call(stats.startAttempt, () =>
    authedFetch(`/api/quizzes/${quizId}/attempts`, { method: "POST" }),
  );
  const { attempt } = (await startRes.json()) as { attempt: { id: string } };

  const getRes = await call(stats.getAttempt, () =>
    authedFetch(`/api/attempts/${attempt.id}`),
  );
  const { attempt: full } = (await getRes.json()) as {
    attempt: { questions: { questionId: string; options: { id: string }[] }[] };
  };

  for (const question of full.questions) {
    const optionId = question.options[0]?.id;
    if (!optionId) continue;
    await call(stats.saveAnswer, () =>
      authedFetch(`/api/attempts/${attempt.id}/answers`, {
        method: "PUT",
        body: JSON.stringify({
          questionId: question.questionId,
          selectedOptionIds: [optionId],
        }),
      }),
    );
  }

  await call(stats.submit, () =>
    authedFetch(`/api/attempts/${attempt.id}/submit`, { method: "POST" }),
  );
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

  console.log(
    `Simulating ${CONCURRENCY} concurrent students taking "${quiz.title}" against ${BASE_URL}...`,
  );

  const stats: Record<string, StepStats> = {
    login: newStats("login"),
    startAttempt: newStats("startAttempt"),
    getAttempt: newStats("getAttempt"),
    saveAnswer: newStats("saveAnswer"),
    submit: newStats("submit"),
  };

  const wallStart = performance.now();
  const results = await Promise.allSettled(
    Array.from({ length: CONCURRENCY }, (_, i) =>
      studentFlow(i, quiz.id, stats),
    ),
  );
  const wallMs = performance.now() - wallStart;

  const failures = results.filter((r) => r.status === "rejected");
  console.log(
    `\nCompleted in ${(wallMs / 1000).toFixed(1)}s — ${results.length - failures.length}/${results.length} students finished the full flow.\n`,
  );
  for (const s of Object.values(stats)) {
    console.log(summarize(s));
  }
  if (failures.length > 0) {
    console.log(
      `\nFirst failure: ${(failures[0] as PromiseRejectedResult).reason}`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error("Exam flow load test failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
