import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { conflict, unauthorized } from "@/lib/api-response";
import { db } from "@/lib/db";
import { teachers, users } from "@/database/schema";
import { hashPassword, verifyPassword } from "@/backend/auth/password";
import {
  createSession,
  destroySession,
  type AuthUser,
} from "@/backend/auth/session";
import type { LoginInput, RegisterInput } from "@/backend/auth/auth.schema";

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

/** The one public self-registration path in the app, and it's teacher-only by construction —
 * `role: "teacher"` is hardcoded below, never taken from `input`. Mirrors user.service.ts's
 * createUser/createStudentAccount (existence pre-check, hash, insert both the `users` row and
 * the role-specific table row in one transaction), but also logs the new account in
 * immediately, matching login()'s own return shape so the API route can reuse the same
 * setSessionCookie call either way. */
export async function register(input: RegisterInput): Promise<LoginResult> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (existing) throw conflict("An account with this email already exists");

  const passwordHash = await hashPassword(input.password);

  const user = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(users)
      .values({
        email: input.email,
        passwordHash,
        name: input.name,
        role: "teacher",
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
      });

    await tx.insert(teachers).values({ userId: row.id });
    return row;
  });

  const sessionToken = await createSession(user);
  return { user, sessionToken };
}
