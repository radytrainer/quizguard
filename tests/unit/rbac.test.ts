import { describe, expect, it } from "vitest";

import { isRoleAllowed } from "@/backend/auth/rbac";
import type { AuthUser } from "@/backend/auth/session";

function userWithRole(role: AuthUser["role"]): AuthUser {
  return { id: "u1", email: "u@example.com", name: "Test User", role };
}

describe("isRoleAllowed", () => {
  it("allows any authenticated user when no role is required", () => {
    expect(isRoleAllowed(userWithRole("student"))).toBe(true);
  });

  it("allows a user whose role matches a single required role", () => {
    expect(isRoleAllowed(userWithRole("admin"), "admin")).toBe(true);
  });

  it("denies a user whose role does not match a single required role", () => {
    expect(isRoleAllowed(userWithRole("student"), "admin")).toBe(false);
  });

  it("allows a user whose role is in a required role list", () => {
    expect(isRoleAllowed(userWithRole("teacher"), ["admin", "teacher"])).toBe(
      true,
    );
  });

  it("denies a user whose role is not in a required role list", () => {
    expect(isRoleAllowed(userWithRole("student"), ["admin", "teacher"])).toBe(
      false,
    );
  });

  it("never allows a student to satisfy an admin-or-teacher requirement", () => {
    // The concrete case Section 3 calls out: students must never reach data or
    // routes gated to admin/teacher.
    expect(isRoleAllowed(userWithRole("student"), ["admin", "teacher"])).toBe(
      false,
    );
  });
});
