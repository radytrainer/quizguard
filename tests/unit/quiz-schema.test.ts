import { describe, expect, it } from "vitest";

import {
  quizInputSchema,
  quizQuestionPoolSchema,
} from "@/backend/quizzes/quiz.schema";

const base = {
  title: "MySQL Fundamentals",
  subject: "MySQL",
  durationMinutes: 60,
  passingScore: 70,
  maxAttempts: 1,
  questionsPerAttempt: 10,
};

describe("quizInputSchema", () => {
  it("accepts a minimal valid quiz", () => {
    expect(quizInputSchema.safeParse(base).success).toBe(true);
  });

  it("defaults boolean settings", () => {
    const result = quizInputSchema.parse(base);
    expect(result.randomizeQuestions).toBe(false);
    expect(result.autoSave).toBe(true);
    expect(result.autoSubmit).toBe(true);
    expect(result.showResults).toBe(true);
  });

  it("rejects an empty title", () => {
    expect(quizInputSchema.safeParse({ ...base, title: "" }).success).toBe(
      false,
    );
  });

  it("rejects endAt before startAt", () => {
    const result = quizInputSchema.safeParse({
      ...base,
      startAt: "2026-02-01T00:00:00.000Z",
      endAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("accepts endAt after startAt", () => {
    const result = quizInputSchema.safeParse({
      ...base,
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-02-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a passing score over 100", () => {
    expect(
      quizInputSchema.safeParse({ ...base, passingScore: 150 }).success,
    ).toBe(false);
  });

  it("rejects zero questions per attempt", () => {
    expect(
      quizInputSchema.safeParse({ ...base, questionsPerAttempt: 0 }).success,
    ).toBe(false);
  });
});

describe("quizQuestionPoolSchema", () => {
  const validId1 = "d7721df0-46a1-40b3-a85b-eca4893fa921";
  const validId2 = "25edb4b8-03bc-4a1e-bc58-22c5afd09245";

  it("accepts a list of unique question IDs", () => {
    const result = quizQuestionPoolSchema.safeParse({
      questionIds: [validId1, validId2],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty pool", () => {
    expect(quizQuestionPoolSchema.safeParse({ questionIds: [] }).success).toBe(
      false,
    );
  });

  it("rejects duplicate IDs", () => {
    const result = quizQuestionPoolSchema.safeParse({
      questionIds: [validId1, validId1],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID entry", () => {
    expect(
      quizQuestionPoolSchema.safeParse({ questionIds: ["not-a-uuid"] }).success,
    ).toBe(false);
  });
});
