import { describe, expect, it } from "vitest";

import { assignmentInputSchema } from "@/backend/assignments/assignment.schema";

const classId = "d7721df0-46a1-40b3-a85b-eca4893fa921";
const studentId = "25edb4b8-03bc-4a1e-bc58-22c5afd09245";

describe("assignmentInputSchema", () => {
  it("accepts a class-only assignment", () => {
    expect(assignmentInputSchema.safeParse({ classId }).success).toBe(true);
  });

  it("accepts a student-only assignment", () => {
    expect(assignmentInputSchema.safeParse({ studentId }).success).toBe(true);
  });

  it("rejects neither classId nor studentId", () => {
    expect(assignmentInputSchema.safeParse({}).success).toBe(false);
  });

  it("rejects both classId and studentId", () => {
    expect(
      assignmentInputSchema.safeParse({ classId, studentId }).success,
    ).toBe(false);
  });

  it("accepts an optional schedule override", () => {
    const result = assignmentInputSchema.safeParse({
      classId,
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-02-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects endAt before startAt", () => {
    const result = assignmentInputSchema.safeParse({
      classId,
      startAt: "2026-02-01T00:00:00.000Z",
      endAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});
