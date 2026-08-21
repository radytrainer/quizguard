import "server-only";

import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { cache } from "react";

import { env } from "@/lib/env";
import { redis } from "@/lib/redis";
import {
  getUserBySessionToken,
  sessionKey,
  SESSION_TTL_SECONDS,
  type AuthUser,
} from "@/backend/auth/session-lookup";

export const SESSION_COOKIE_NAME = "qg_session";

export type { AuthUser };

/**
 * Sessions live only in Redis, not PostgreSQL — see docs/ARCHITECTURE.md — Redis vs.
 * PostgreSQL. PostgreSQL remains the source of truth for the *account*; the session is a
 * disposable proof-of-login that a re-login regenerates, so a Redis flush degrades to
 * "everyone re-logs-in," never to lost data. This also gives instant, complete revocation
 * (e.g. an admin disabling a student) for free via a single Redis DEL — a stateless/JWT
 * session would need a separate revocation list to get the same guarantee.
 */
export async function createSession(user: AuthUser): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await redis.set(
    sessionKey(token),
    JSON.stringify(user),
    "EX",
    SESSION_TTL_SECONDS,
  );
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await redis.del(sessionKey(token));
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

export async function getSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value;
}

/**
 * The DAL's core primitive (see Next.js authentication guide — Data Access Layer). Wrapped in
 * React's `cache()` so multiple calls within one request/render pass share a single Redis
 * lookup instead of one per caller.
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const token = await getSessionToken();
  if (!token) return null;
  return getUserBySessionToken(token);
});
