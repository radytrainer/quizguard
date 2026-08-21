import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { db, pool } from "@/lib/db";
import { students, teachers, users } from "@/database/schema";
import { verifyPassword } from "@/backend/auth/password";
import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  resetUserPassword,
  updateUser,
} from "@/backend/users/user.service";

// Requires `docker compose up -d` (PostgreSQL).
describe("user.service (integration)", () => {
  const suffix = randomUUID().slice(0, 8);
  const createdIds: string[] = [];

  afterAll(async () => {
    await db.delete(teachers).where(inArray(teachers.userId, createdIds));
    await db.delete(students).where(inArray(students.userId, createdIds));
    await db.delete(users).where(inArray(users.id, createdIds));
    await pool.end();
  });

  it("creates a student and inserts a matching students row", async () => {
    const user = await createUser({
      email: `user-service-student-${suffix}@quizguard.test`,
      password: "Passw0rd!",
      name: "Service Student",
      role: "student",
      studentNumber: "S-1",
    });
    createdIds.push(user.id);

    expect(user.role).toBe("student");
    expect(user.status).toBe("active");

    const [row] = await db
      .select()
      .from(students)
      .where(inArray(students.userId, [user.id]));
    expect(row.studentNumber).toBe("S-1");
  });

  it("creates a teacher and inserts a matching teachers row", async () => {
    const user = await createUser({
      email: `user-service-teacher-${suffix}@quizguard.test`,
      password: "Passw0rd!",
      name: "Service Teacher",
      role: "teacher",
    });
    createdIds.push(user.id);

    const [row] = await db
      .select()
      .from(teachers)
      .where(inArray(teachers.userId, [user.id]));
    expect(row).toBeDefined();
  });

  it("rejects a duplicate email", async () => {
    const email = `user-service-dup-${suffix}@quizguard.test`;
    const user = await createUser({
      email,
      password: "Passw0rd!",
      name: "First",
      role: "admin",
    });
    createdIds.push(user.id);

    await expect(
      createUser({
        email,
        password: "Passw0rd!",
        name: "Second",
        role: "admin",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("gets a user and 404s for a missing id", async () => {
    const user = await createUser({
      email: `user-service-get-${suffix}@quizguard.test`,
      password: "Passw0rd!",
      name: "Gettable",
      role: "admin",
    });
    createdIds.push(user.id);

    const fetched = await getUser(user.id);
    expect(fetched.id).toBe(user.id);

    await expect(getUser(randomUUID())).rejects.toMatchObject({ status: 404 });
  });

  it("updates name and status", async () => {
    const user = await createUser({
      email: `user-service-update-${suffix}@quizguard.test`,
      password: "Passw0rd!",
      name: "Before",
      role: "admin",
    });
    createdIds.push(user.id);

    const updated = await updateUser(user.id, {
      name: "After",
      status: "disabled",
    });
    expect(updated.name).toBe("After");
    expect(updated.status).toBe("disabled");
  });

  it("resets a password so the new one verifies and the old one doesn't", async () => {
    const user = await createUser({
      email: `user-service-reset-${suffix}@quizguard.test`,
      password: "OldPassw0rd!",
      name: "Resettable",
      role: "admin",
    });
    createdIds.push(user.id);

    await resetUserPassword(user.id, "NewPassw0rd!");

    const [row] = await db
      .select()
      .from(users)
      .where(inArray(users.id, [user.id]));
    expect(await verifyPassword("NewPassw0rd!", row.passwordHash)).toBe(true);
    expect(await verifyPassword("OldPassw0rd!", row.passwordHash)).toBe(false);
  });

  it("soft-deletes: getUser 404s afterward", async () => {
    const user = await createUser({
      email: `user-service-delete-${suffix}@quizguard.test`,
      password: "Passw0rd!",
      name: "Deletable",
      role: "admin",
    });
    createdIds.push(user.id);

    await deleteUser(user.id);
    await expect(getUser(user.id)).rejects.toMatchObject({ status: 404 });
  });

  it("filters listUsers by role and search", async () => {
    const user = await createUser({
      email: `user-service-list-${suffix}@quizguard.test`,
      password: "Passw0rd!",
      name: `Findable Person ${suffix}`,
      role: "teacher",
    });
    createdIds.push(user.id);

    const byRole = await listUsers({ role: "teacher", page: 1, pageSize: 100 });
    expect(byRole.items.every((u) => u.role === "teacher")).toBe(true);
    expect(byRole.items.some((u) => u.id === user.id)).toBe(true);

    const bySearch = await listUsers({
      search: `Findable Person ${suffix}`,
      page: 1,
      pageSize: 20,
    });
    expect(bySearch.items).toHaveLength(1);
    expect(bySearch.items[0].id).toBe(user.id);
  });
});
