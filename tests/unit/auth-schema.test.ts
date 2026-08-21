import { describe, expect, it } from "vitest";

import { loginSchema } from "@/backend/auth/auth.schema";

describe("loginSchema", () => {
  it("accepts a valid email and password", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "hunter2",
    });
    expect(result.success).toBe(true);
  });

  it("lowercases and trims the email", () => {
    const result = loginSchema.parse({
      email: "  User@Example.com  ",
      password: "hunter2",
    });
    expect(result.email).toBe("user@example.com");
  });

  it("rejects an invalid email", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "hunter2",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password longer than bcrypt's 72-byte input limit", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "a".repeat(73),
    });
    expect(result.success).toBe(false);
  });
});
