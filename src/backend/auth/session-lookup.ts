import { redis } from "@/lib/redis";
import type { UserRole } from "@/database/schema/users";

/**
 * Deliberately has no `"server-only"` guard and no `next/headers` import — unlike session.ts,
 * this module is also imported by src/realtime/server.ts, a standalone Node process outside
 * Next's bundler and request context (same reasoning as backend/auth/password.ts and the seed
 * scripts). It holds only the token-in, user-out Redis lookup; cookie handling stays in
 * session.ts, which wraps this for the Next app.
 */

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days, sliding

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export function sessionKey(token: string): string {
  return `session:${token}`;
}

export async function getUserBySessionToken(
  token: string,
): Promise<AuthUser | null> {
  const key = sessionKey(token);
  const raw = await redis.get(key);
  if (!raw) return null;

  // Sliding expiration: an active user's session never expires mid-use.
  await redis.expire(key, SESSION_TTL_SECONDS);

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}
