import { describe, expect, it } from "vitest";

import { saveAnswerSchema } from "@/backend/answers/answer.schema";

const questionId = "d7721df0-46a1-40b3-a85b-eca4893fa921";
const optionId = "25edb4b8-03bc-4a1e-bc58-22c5afd09245";

describe("saveAnswerSchema", () => {
  it("accepts a choice answer", () => {
    const result = saveAnswerSchema.safeParse({
      questionId,
      selectedOptionIds: [optionId],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty selectedOptionIds (clearing an answer)", () => {
    const result = saveAnswerSchema.safeParse({
      questionId,
      selectedOptionIds: [],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a text answer", () => {
    const result = saveAnswerSchema.safeParse({
      questionId,
      textAnswer: "forty-two",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty textAnswer (clearing an answer)", () => {
    const result = saveAnswerSchema.safeParse({ questionId, textAnswer: "" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing questionId", () => {
    const result = saveAnswerSchema.safeParse({
      selectedOptionIds: [optionId],
    });
    expect(result.success).toBe(false);
  });

  it("rejects neither selectedOptionIds nor textAnswer", () => {
    const result = saveAnswerSchema.safeParse({ questionId });
    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID option id", () => {
    const result = saveAnswerSchema.safeParse({
      questionId,
      selectedOptionIds: ["not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });
});
