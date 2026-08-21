import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { unauthorized } from "@/lib/api-response";
import { db } from "@/lib/db";
import { users } from "@/database/schema";
import { verifyPassword } from "@/backend/auth/password";
import {
  createSession,
  destroySession,
  type AuthUser,
} from "@/backend/auth/session";
import type { LoginInput } from "@/backend/auth/auth.schema";

export interface LoginResult {
  user: AuthUser;
  sessionToken: string;
}

export async function login({
  email,
  password,
}: LoginInput): Promise<LoginResult> {
  const [record] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  // Same generic error whether the email doesn't exist, the account is disabled/deleted, or
  // the password is wrong — never let a login endpoint reveal which accounts exist.
  const invalidCredentials = unauthorized("Invalid email or password");

  if (!record || record.status !== "active") {
    throw invalidCredentials;
  }

  const passwordMatches = await verifyPassword(password, record.passwordHash);
  if (!passwordMatches) {
    throw invalidCredentials;
  }

  const user: AuthUser = {
    id: record.id,
    email: record.email,
    name: record.name,
    role: record.role,
  };

  const sessionToken = await createSession(user);
  return { user, sessionToken };
}

export async function logout(sessionToken: string): Promise<void> {
  await destroySession(sessionToken);
}
