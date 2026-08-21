import { describe, expect, it } from "vitest";

import { realtimeEventSchema } from "@/backend/realtime/realtime-event.schema";

const base = {
  quizId: "d7721df0-46a1-40b3-a85b-eca4893fa921",
  attemptId: "25edb4b8-03bc-4a1e-bc58-22c5afd09245",
  studentId: "6ac8a483-2ccd-4fef-ba0c-7a35a3368cb2",
  studentName: "Sam Student",
  occurredAt: "2026-08-18T00:00:00.000Z",
};

describe("realtimeEventSchema", () => {
  it("accepts an attempt_started event", () => {
    const result = realtimeEventSchema.safeParse({
      type: "attempt_started",
      ...base,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an attempt_submitted event with a nullable score", () => {
    const result = realtimeEventSchema.safeParse({
      type: "attempt_submitted",
      ...base,
      status: "submitted",
      score: null,
      maxScore: null,
      passed: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a violation event", () => {
    const result = realtimeEventSchema.safeParse({
      type: "violation",
      ...base,
      violationType: "tab_switch",
      locked: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an attempt_unlocked event", () => {
    const result = realtimeEventSchema.safeParse({
      type: "attempt_unlocked",
      ...base,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown event type", () => {
    const result = realtimeEventSchema.safeParse({
      type: "attempt_deleted",
      ...base,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a violation event with an invalid violationType", () => {
    const result = realtimeEventSchema.safeParse({
      type: "violation",
      ...base,
      violationType: "screen_share",
      locked: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID quizId", () => {
    const result = realtimeEventSchema.safeParse({
      type: "attempt_started",
      ...base,
      quizId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});
