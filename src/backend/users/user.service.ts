import "server-only";

import { and, count, desc, eq, ilike, isNull, or } from "drizzle-orm";

import { conflict, notFound } from "@/lib/api-response";
import { db } from "@/lib/db";
import { hashPassword } from "@/backend/auth/password";
import { students, teachers, users, type Gender } from "@/database/schema";
import type {
  CreateUserInput,
  UpdateUserInput,
  UserListQuery,
} from "@/backend/users/user.schema";

// Deliberately excludes passwordHash — every function below returns this shape, never a raw
// `users` row, so a bcrypt hash can never leak into an API response by accident.
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "teacher" | "student";
  status: "active" | "disabled";
  createdAt: Date;
  updatedAt: Date;
}

const publicColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  status: users.status,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

export interface UserListResult {
  items: PublicUser[];
  total: number;
  page: number;
  pageSize: number;
}

async function requireActiveUser(id: string): Promise<PublicUser> {
  const [user] = await db
    .select(publicColumns)
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);

  if (!user) throw notFound("User not found");
  return user;
}

export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (existing) throw conflict("A user with this email already exists");

  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email: input.email,
        passwordHash,
        name: input.name,
        role: input.role,
      })
      .returning(publicColumns);

    if (input.role === "teacher") {
      await tx.insert(teachers).values({ userId: user.id });
    } else if (input.role === "student") {
      await tx.insert(students).values({
        userId: user.id,
        studentNumber: input.studentNumber ? input.studentNumber : null,
      });
    }

    return user;
  });
}

// Used by the teacher "add new student to my class" flow (see class.service.ts's
// createStudentInClass) — always role "student", unlike the admin-only createUser above.
export async function createStudentAccount(input: {
  name: string;
  email: string;
  password: string;
  gender: Gender;
}): Promise<PublicUser> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (existing) throw conflict("A user with this email already exists");

  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email: input.email,
        passwordHash,
        name: input.name,
        role: "student",
      })
      .returning(publicColumns);

    await tx.insert(students).values({ userId: user.id, gender: input.gender });

    return user;
  });
}

export async function getUser(id: string): Promise<PublicUser> {
  return requireActiveUser(id);
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
): Promise<PublicUser> {
  await requireActiveUser(id);

  const [user] = await db
    .update(users)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning(publicColumns);

  return user;
}

export async function resetUserPassword(
  id: string,
  newPassword: string,
): Promise<void> {
  await requireActiveUser(id);
  const passwordHash = await hashPassword(newPassword);

  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, id));
}

export async function deleteUser(id: string): Promise<void> {
  await requireActiveUser(id);

  await db
    .update(users)
    .set({ deletedAt: new Date(), status: "disabled" })
    .where(eq(users.id, id));
}

export async function listUsers(query: UserListQuery): Promise<UserListResult> {
  const conditions = [isNull(users.deletedAt)];

  if (query.search) {
    const term = `%${query.search}%`;
    conditions.push(or(ilike(users.name, term), ilike(users.email, term))!);
  }
  if (query.role) conditions.push(eq(users.role, query.role));
  if (query.status) conditions.push(eq(users.status, query.status));

  const where = and(...conditions);

  const [{ total }] = await db
    .select({ total: count() })
    .from(users)
    .where(where);

  const items = await db
    .select(publicColumns)
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  return { items, total, page: query.page, pageSize: query.pageSize };
}
