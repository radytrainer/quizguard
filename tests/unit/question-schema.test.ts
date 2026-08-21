import { describe, expect, it } from "vitest";

import { questionInputSchema } from "@/backend/questions/question.schema";

const base = {
  subject: "MySQL",
  text: "What does ROLLBACK do?",
};

describe("questionInputSchema — multiple_choice", () => {
  it("accepts exactly one correct option among 2+", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "multiple_choice",
      options: [
        { text: "Undoes uncommitted changes", isCorrect: true },
        { text: "Deletes the table", isCorrect: false },
        { text: "Creates a savepoint", isCorrect: false },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero correct options", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "multiple_choice",
      options: [
        { text: "A", isCorrect: false },
        { text: "B", isCorrect: false },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects two correct options", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "multiple_choice",
      options: [
        { text: "A", isCorrect: true },
        { text: "B", isCorrect: true },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects fewer than 2 options", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "multiple_choice",
      options: [{ text: "A", isCorrect: true }],
    });
    expect(result.success).toBe(false);
  });
});

describe("questionInputSchema — true_false", () => {
  it("accepts exactly 2 options with exactly 1 correct", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "true_false",
      options: [
        { text: "True", isCorrect: true },
        { text: "False", isCorrect: false },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects 3 options", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "true_false",
      options: [
        { text: "True", isCorrect: true },
        { text: "False", isCorrect: false },
        { text: "Maybe", isCorrect: false },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("questionInputSchema — multiple_answer", () => {
  it("accepts 2+ correct options with at least 1 incorrect", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "multiple_answer",
      options: [
        { text: "A", isCorrect: true },
        { text: "B", isCorrect: true },
        { text: "C", isCorrect: false },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects only 1 correct option", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "multiple_answer",
      options: [
        { text: "A", isCorrect: true },
        { text: "B", isCorrect: false },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects all options marked correct (no distractor)", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "multiple_answer",
      options: [
        { text: "A", isCorrect: true },
        { text: "B", isCorrect: true },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("questionInputSchema — short_answer / fill_in_blank", () => {
  it("accepts one or more accepted answers with no isCorrect field", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "short_answer",
      options: [{ text: "42" }, { text: "forty-two" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero accepted answers", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "fill_in_blank",
      options: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("questionInputSchema — shared field validation", () => {
  it("rejects an empty question text", () => {
    const result = questionInputSchema.safeParse({
      subject: "MySQL",
      text: "",
      type: "short_answer",
      options: [{ text: "42" }],
    });
    expect(result.success).toBe(false);
  });

  it("defaults difficulty to medium and points to 1", () => {
    const result = questionInputSchema.parse({
      ...base,
      type: "short_answer",
      options: [{ text: "42" }],
    });
    expect(result.difficulty).toBe("medium");
    expect(result.points).toBe(1);
  });

  it("leaves category/explanation absent when omitted (schema doesn't require them)", () => {
    const result = questionInputSchema.parse({
      ...base,
      type: "short_answer",
      options: [{ text: "42" }],
    });
    expect(result.category).toBeUndefined();
    expect(result.explanation).toBeUndefined();
  });
});
