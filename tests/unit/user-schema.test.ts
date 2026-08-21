import { describe, expect, it } from "vitest";

import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
  userListQuerySchema,
} from "@/backend/users/user.schema";

describe("createUserSchema", () => {
  const base = {
    email: "new.student@quizguard.test",
    password: "Passw0rd!",
    name: "New Student",
    role: "student" as const,
  };

  it("accepts a minimal valid user", () => {
    expect(createUserSchema.safeParse(base).success).toBe(true);
  });

  it("lowercases and trims the email", () => {
    const result = createUserSchema.parse({
      ...base,
      email: "  New.Student@Quizguard.TEST  ",
    });
    expect(result.email).toBe("new.student@quizguard.test");
  });

  it("rejects an invalid email", () => {
    expect(
      createUserSchema.safeParse({ ...base, email: "not-an-email" }).success,
    ).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(
      createUserSchema.safeParse({ ...base, password: "short" }).success,
    ).toBe(false);
  });

  it("rejects an invalid role", () => {
    expect(
      createUserSchema.safeParse({ ...base, role: "superadmin" }).success,
    ).toBe(false);
  });

  it("accepts an optional studentNumber", () => {
    const result = createUserSchema.safeParse({
      ...base,
      studentNumber: "S-42",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateUserSchema", () => {
  it("accepts an empty object (no changes)", () => {
    expect(updateUserSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a status change", () => {
    expect(updateUserSchema.safeParse({ status: "disabled" }).success).toBe(
      true,
    );
  });

  it("rejects an invalid status", () => {
    expect(updateUserSchema.safeParse({ status: "banned" }).success).toBe(
      false,
    );
  });
});

describe("resetPasswordSchema", () => {
  it("rejects a short password", () => {
    expect(resetPasswordSchema.safeParse({ password: "abc" }).success).toBe(
      false,
    );
  });

  it("accepts a valid password", () => {
    expect(
      resetPasswordSchema.safeParse({ password: "NewPassw0rd!" }).success,
    ).toBe(true);
  });
});

describe("userListQuerySchema", () => {
  it("defaults page and pageSize", () => {
    const result = userListQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it("rejects an invalid role filter", () => {
    expect(userListQuerySchema.safeParse({ role: "owner" }).success).toBe(
      false,
    );
  });
});
