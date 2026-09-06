import { describe, expect, it } from "vitest";

import {
  computeCodeAnswerScore,
  computeNumericCorrectness,
} from "@/backend/answers/answer-scoring";

describe("computeNumericCorrectness", () => {
  it("is correct for an exact match with zero tolerance", () => {
    expect(computeNumericCorrectness("42", 42, 0)).toBe(true);
  });

  it("is correct within tolerance", () => {
    expect(computeNumericCorrectness("3.14", 3.14159, 0.01)).toBe(true);
  });

  it("is incorrect just outside tolerance", () => {
    expect(computeNumericCorrectness("3.1", 3.14159, 0.01)).toBe(false);
  });

  it("is correct exactly at the tolerance boundary", () => {
    expect(computeNumericCorrectness("10", 12, 2)).toBe(true);
  });

  it("is incorrect for a non-numeric submission", () => {
    expect(computeNumericCorrectness("forty-two", 42, 0)).toBe(false);
  });

  it("is incorrect for a missing submission", () => {
    expect(computeNumericCorrectness(null, 42, 0)).toBe(false);
  });

  it("handles negative accepted values and submissions", () => {
    expect(computeNumericCorrectness("-5", -5.5, 1)).toBe(true);
    expect(computeNumericCorrectness("-5", -10, 1)).toBe(false);
  });
});

describe("computeCodeAnswerScore", () => {
  it("awards full credit and isCorrect when every test case passes", () => {
    const result = computeCodeAnswerScore(
      [{ passed: true }, { passed: true }],
      10,
    );
    expect(result).toEqual({ pointsAwarded: 10, isCorrect: true });
  });

  it("awards proportional credit and isCorrect: false when only some pass", () => {
    const result = computeCodeAnswerScore(
      [{ passed: true }, { passed: false }],
      10,
    );
    expect(result).toEqual({ pointsAwarded: 5, isCorrect: false });
  });

  it("awards zero when every test case fails", () => {
    const result = computeCodeAnswerScore(
      [{ passed: false }, { passed: false }],
      10,
    );
    expect(result).toEqual({ pointsAwarded: 0, isCorrect: false });
  });

  it("awards zero, not full credit, for zero test results", () => {
    const result = computeCodeAnswerScore([], 10);
    expect(result).toEqual({ pointsAwarded: 0, isCorrect: false });
  });

  it("rounds a non-evenly-divisible pass rate to the nearest point", () => {
    // 1 of 3 passing: 10 * 1/3 = 3.33 -> 3
    const result = computeCodeAnswerScore(
      [{ passed: true }, { passed: false }, { passed: false }],
      10,
    );
    expect(result.pointsAwarded).toBe(3);
    expect(result.isCorrect).toBe(false);
  });
});
