import { describe, expect, it } from "vitest";

import {
  classInputSchema,
  classListQuerySchema,
  rosterAddSchema,
} from "@/backend/classes/class.schema";

describe("classInputSchema", () => {
  it("accepts a name-only class (teacherId defaults server-side)", () => {
    expect(classInputSchema.safeParse({ name: "Algorithms 101" }).success).toBe(
      true,
    );
  });

  it("rejects an empty name", () => {
    expect(classInputSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("accepts an explicit teacherId", () => {
    const result = classInputSchema.safeParse({
      name: "Algorithms 101",
      teacherId: "d7721df0-46a1-40b3-a85b-eca4893fa921",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID teacherId", () => {
    expect(
      classInputSchema.safeParse({ name: "Algorithms 101", teacherId: "nope" })
        .success,
    ).toBe(false);
  });
});

describe("classListQuerySchema", () => {
  it("defaults page and pageSize", () => {
    const result = classListQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });
});

describe("rosterAddSchema", () => {
  it("requires a UUID studentId", () => {
    expect(rosterAddSchema.safeParse({ studentId: "not-a-uuid" }).success).toBe(
      false,
    );
    expect(
      rosterAddSchema.safeParse({
        studentId: "d7721df0-46a1-40b3-a85b-eca4893fa921",
      }).success,
    ).toBe(true);
  });
});
