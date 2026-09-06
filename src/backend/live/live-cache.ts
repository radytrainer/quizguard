// Deliberately no "server-only" guard — imported directly by src/realtime/server.ts, a plain
// Node process outside Next's bundler, same portability discipline as live.service.ts and
// backend/auth/session-lookup.ts.
//
// Redis-backed hot-path cache for the live (Kahoot-style) game loop. Every value here is fully
// reconstructable from live.service.ts's own PostgreSQL queries (docs/ARCHITECTURE.md — Section
// 3: Redis is for temporary/high-frequency state, never the source of truth), so a cache miss —
// or a full Redis outage — costs one extra DB read per caller, never lost game state or a wrong
// score. Every read here returns `null` on a miss *or* a Redis error, by design: callers fall
// back to the equivalent PostgreSQL query rather than propagate the failure (same "best-effort"
// discipline as realtime.service.ts#publishRealtimeEvent).
//
// Every function takes the Redis client as its last, defaulting parameter — same DI pattern as
// lib/rate-limit.ts#checkRateLimit — so tests can pass an `ioredis-mock` client instead of a real
// connection (see tests/unit/live-cache.test.ts).
import type { Redis } from "ioredis";

import { redis } from "@/lib/redis";

// A live session realistically runs minutes, not hours — this is cleanup insurance for a
// session whose keys never get explicitly cleared (a crashed realtime process, a game nobody
// bothers to end), not a correctness-relevant window.
const CACHE_TTL_SECONDS = 6 * 60 * 60;

function rosterCountKey(sessionId: string): string {
  return `live:${sessionId}:roster-count`;
}

function answeredCountKey(sessionId: string, questionIndex: number): string {
  return `live:${sessionId}:answered:${questionIndex}`;
}

/**
 * Set right after every join's own fresh roster fetch (live.service.ts#getRoster is the only
 * place the roster actually changes) — so every answer during that question can read a count
 * instead of re-fetching every participant row just to call `.length` on it.
 */
export async function setRosterCount(
  sessionId: string,
  total: number,
  client: Redis = redis,
): Promise<void> {
  try {
    await client.set(rosterCountKey(sessionId), total, "EX", CACHE_TTL_SECONDS);
  } catch {
    // Best-effort — see file header. The next read falls back to PostgreSQL.
  }
}

export async function getRosterCount(
  sessionId: string,
  client: Redis = redis,
): Promise<number | null> {
  try {
    const raw = await client.get(rosterCountKey(sessionId));
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Fast path for "how many players have answered this question" — an INCR per successful
 * submitAnswer() call (only ever called after the DB insert it mirrors actually succeeds, never
 * speculatively) replaces a SQL COUNT(*) that would otherwise run once per student, all hitting
 * the same rows, in the same few-second window every student answers in.
 *
 * Returns `null` on a Redis error so the caller falls back to live.service.ts#getAnswerCount —
 * note this fallback only affects the "reveal early once everyone's answered" heuristic, never
 * scoring: an intermittent Redis failure can undercount and merely delay that early reveal until
 * the timer fires, since the answer itself is already durably written to PostgreSQL regardless.
 */
export async function incrAnsweredCount(
  sessionId: string,
  questionIndex: number,
  client: Redis = redis,
): Promise<number | null> {
  try {
    const key = answeredCountKey(sessionId, questionIndex);
    const total = await client.incr(key);
    if (total === 1) await client.expire(key, CACHE_TTL_SECONDS);
    return total;
  } catch {
    return null;
  }
}

/**
 * Called once a session ends (host_cancel, or advanceQuestion's finished branch) to free its
 * keys immediately rather than waiting out the TTL. Cheap hygiene, not a correctness
 * requirement — the TTL alone would eventually reclaim them.
 */
export async function clearSessionCache(
  sessionId: string,
  questionCount: number,
  client: Redis = redis,
): Promise<void> {
  const keys = [rosterCountKey(sessionId)];
  for (let i = 0; i < questionCount; i++) {
    keys.push(answeredCountKey(sessionId, i));
  }
  try {
    await client.del(...keys);
  } catch {
    // Best-effort — see file header.
  }
}
