import { describe, expect, it } from "vitest";

import {
  autoDetectMapping,
  parseImportRow,
  type ColumnMapping,
} from "@/backend/imports/import-row.schema";

const mcMapping: ColumnMapping = {
  question: "question",
  type: "type",
  option_a: "option_a",
  option_b: "option_b",
  option_c: "option_c",
  option_d: "option_d",
  correct_answer: "correct_answer",
  points: "points",
  subject: "subject",
  category: "category",
  difficulty: "difficulty",
  tags: "tags",
  explanation: "explanation",
};

function row(overrides: Record<string, string>) {
  return {
    question: "What does ROLLBACK do?",
    type: "multiple_choice",
    option_a: "Undoes changes",
    option_b: "Deletes table",
    option_c: "",
    option_d: "",
    correct_answer: "a",
    points: "2",
    subject: "MySQL",
    category: "",
    difficulty: "",
    tags: "",
    explanation: "",
    ...overrides,
  };
}

describe("autoDetectMapping", () => {
  it("matches exact header names", () => {
    const mapping = autoDetectMapping([
      "question",
      "option_a",
      "correct_answer",
      "subject",
    ]);
    expect(mapping.question).toBe("question");
    expect(mapping.correct_answer).toBe("correct_answer");
    expect(mapping.category).toBeNull();
  });

  it("normalizes spaces and dashes/case", () => {
    const mapping = autoDetectMapping([
      "Question",
      "Correct Answer",
      "option-a",
    ]);
    expect(mapping.question).toBe("Question");
    expect(mapping.correct_answer).toBe("Correct Answer");
    expect(mapping.option_a).toBe("option-a");
  });
});

describe("parseImportRow — multiple choice", () => {
  it("parses a valid row", () => {
    const result = parseImportRow(row({}), mcMapping, 2, new Set());
    expect(result.errors).toHaveLength(0);
    expect(result.question?.type).toBe("multiple_choice");
    if (result.question?.type === "multiple_choice") {
      expect(result.question.options.filter((o) => o.isCorrect)).toHaveLength(
        1,
      );
    }
  });

  it("flags a missing question", () => {
    const result = parseImportRow(
      row({ question: "" }),
      mcMapping,
      2,
      new Set(),
    );
    expect(result.errors).toContain("Missing question");
  });

  it("flags a missing answer", () => {
    const result = parseImportRow(
      row({ correct_answer: "" }),
      mcMapping,
      2,
      new Set(),
    );
    expect(result.errors).toContain("Missing answer");
  });

  it("flags an invalid correct answer (letter with no matching option)", () => {
    const result = parseImportRow(
      row({ correct_answer: "z" }),
      mcMapping,
      2,
      new Set(),
    );
    expect(
      result.errors.some((e) => e.startsWith("Invalid correct answer")),
    ).toBe(true);
  });

  it("accepts the option's exact text as the correct answer, not just its letter", () => {
    const result = parseImportRow(
      row({ correct_answer: "Undoes changes" }),
      mcMapping,
      2,
      new Set(),
    );
    expect(result.errors).toHaveLength(0);
    if (result.question?.type === "multiple_choice") {
      const correct = result.question.options.find((o) => o.isCorrect);
      expect(correct?.text).toBe("Undoes changes");
    }
  });

  it("matches the correct answer text case-insensitively", () => {
    const result = parseImportRow(
      row({ correct_answer: "undoes CHANGES" }),
      mcMapping,
      2,
      new Set(),
    );
    expect(result.errors).toHaveLength(0);
    if (result.question?.type === "multiple_choice") {
      const correct = result.question.options.find((o) => o.isCorrect);
      expect(correct?.text).toBe("Undoes changes");
    }
  });

  it("flags correct-answer text that doesn't match any option", () => {
    const result = parseImportRow(
      row({ correct_answer: "Not a real option" }),
      mcMapping,
      2,
      new Set(),
    );
    expect(
      result.errors.some((e) => e.startsWith("Invalid correct answer")),
    ).toBe(true);
  });

  it("flags invalid points", () => {
    const result = parseImportRow(
      row({ points: "not-a-number" }),
      mcMapping,
      2,
      new Set(),
    );
    expect(result.errors.some((e) => e.startsWith("Invalid points"))).toBe(
      true,
    );
  });

  it("defaults points to 1 when omitted", () => {
    const result = parseImportRow(row({ points: "" }), mcMapping, 2, new Set());
    expect(result.question?.points).toBe(1);
  });

  it("flags an invalid question type", () => {
    const result = parseImportRow(
      row({ type: "essay" }),
      mcMapping,
      2,
      new Set(),
    );
    expect(
      result.errors.some((e) => e.startsWith("Invalid question type")),
    ).toBe(true);
  });

  it("flags a duplicate question within the same batch", () => {
    const seen = new Set<string>();
    const first = parseImportRow(row({}), mcMapping, 2, seen);
    const second = parseImportRow(row({}), mcMapping, 3, seen);
    expect(first.errors).toHaveLength(0);
    expect(second.errors).toContain("Duplicate question");
  });

  it("treats an unrecognized difficulty as medium rather than an error", () => {
    const result = parseImportRow(
      row({ difficulty: "extreme" }),
      mcMapping,
      2,
      new Set(),
    );
    expect(result.errors).toHaveLength(0);
    expect(result.question?.difficulty).toBe("medium");
  });
});

describe("parseImportRow — true_false", () => {
  it("parses True/False options with a valid correct answer", () => {
    const result = parseImportRow(
      row({
        type: "true_false",
        option_a: "True",
        option_b: "False",
        option_c: "",
        correct_answer: "a",
      }),
      mcMapping,
      2,
      new Set(),
    );
    expect(result.errors).toHaveLength(0);
    expect(result.question?.type).toBe("true_false");
  });
});

describe("parseImportRow — multiple_answer", () => {
  it("parses comma-separated correct letters", () => {
    const result = parseImportRow(
      row({
        type: "multiple_answer",
        option_a: "2",
        option_b: "3",
        option_c: "4",
        correct_answer: "a,b",
      }),
      mcMapping,
      2,
      new Set(),
    );
    expect(result.errors).toHaveLength(0);
    if (result.question?.type === "multiple_answer") {
      expect(result.question.options.filter((o) => o.isCorrect)).toHaveLength(
        2,
      );
    }
  });

  it("parses comma-separated correct answer text, same as an AI-generated JSON array would produce", () => {
    const result = parseImportRow(
      row({
        type: "multiple_answer",
        option_a: "2",
        option_b: "3",
        option_c: "4",
        correct_answer: "2,4",
      }),
      mcMapping,
      2,
      new Set(),
    );
    expect(result.errors).toHaveLength(0);
    if (result.question?.type === "multiple_answer") {
      const correctTexts = result.question.options
        .filter((o) => o.isCorrect)
        .map((o) => o.text);
      expect(correctTexts.sort()).toEqual(["2", "4"]);
    }
  });
});

describe("parseImportRow — short_answer", () => {
  it("splits correct_answer on semicolons into accepted variants", () => {
    const result = parseImportRow(
      row({
        type: "short_answer",
        option_a: "",
        option_b: "",
        correct_answer: "42; forty-two",
      }),
      mcMapping,
      2,
      new Set(),
    );
    expect(result.errors).toHaveLength(0);
    if (result.question?.type === "short_answer") {
      expect(result.question.options.map((o) => o.text)).toEqual([
        "42",
        "forty-two",
      ]);
    }
  });
});

describe("parseImportRow — unmapped fields", () => {
  it("treats an unmapped required field as missing", () => {
    const partialMapping: ColumnMapping = { ...mcMapping, subject: null };
    const result = parseImportRow(row({}), partialMapping, 2, new Set());
    expect(result.errors).toContain("Missing subject");
  });
});
