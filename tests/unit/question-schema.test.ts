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

describe("questionInputSchema — essay", () => {
  it("accepts an empty options array", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "essay",
      options: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects any options at all", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "essay",
      options: [{ text: "anything" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("questionInputSchema — numeric_answer", () => {
  it("accepts exactly one numeric accepted value with a tolerance", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "numeric_answer",
      options: [{ text: "3.14" }],
      numericTolerance: 0.01,
    });
    expect(result.success).toBe(true);
  });

  it("defaults tolerance to 0 when omitted", () => {
    const result = questionInputSchema.parse({
      ...base,
      type: "numeric_answer",
      options: [{ text: "42" }],
    });
    if (result.type !== "numeric_answer") throw new Error("unreachable");
    expect(result.numericTolerance).toBe(0);
  });

  it("rejects a non-numeric accepted value", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "numeric_answer",
      options: [{ text: "forty-two" }],
      numericTolerance: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than one accepted value", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "numeric_answer",
      options: [{ text: "42" }, { text: "43" }],
      numericTolerance: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative tolerance", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "numeric_answer",
      options: [{ text: "42" }],
      numericTolerance: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("questionInputSchema — code_answer", () => {
  it("accepts python with at least one test case", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "code_answer",
      options: [],
      codeLanguage: "python",
      testCases: [{ input: "3\n4\n", expectedOutput: "7", isSample: true }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects python/javascript with zero test cases", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "code_answer",
      options: [],
      codeLanguage: "javascript",
      testCases: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects test cases on an html/css question", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "code_answer",
      options: [],
      codeLanguage: "html",
      testCases: [{ input: "", expectedOutput: "x", isSample: true }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts html/css with no test cases at all (key omitted)", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "code_answer",
      options: [],
      codeLanguage: "html",
    });
    expect(result.success).toBe(true);
  });

  it("accepts previewHtml on a css question", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "code_answer",
      options: [],
      codeLanguage: "css",
      previewHtml: "<button>Click me</button>",
    });
    expect(result.success).toBe(true);
  });

  it("rejects previewHtml on a non-css question", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "code_answer",
      options: [],
      codeLanguage: "python",
      testCases: [{ input: "", expectedOutput: "x", isSample: true }],
      previewHtml: "<div></div>",
    });
    expect(result.success).toBe(false);
  });

  it("rejects any question_options rows", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "code_answer",
      options: [{ text: "anything" }],
      codeLanguage: "html",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid codeLanguage", () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: "code_answer",
      options: [],
      codeLanguage: "ruby",
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
