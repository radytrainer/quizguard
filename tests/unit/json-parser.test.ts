import { describe, expect, it } from "vitest";

import { parseJsonQuestions } from "@/backend/imports/json-parser";
import {
  parseImportRow,
  autoDetectMapping,
} from "@/backend/imports/import-row.schema";

// Runs a parsed JSON row through the same validation every other import source uses, exactly
// as import.service.ts's startImportPreview does — proving the adapter's flattened output is
// actually usable, not just shaped correctly.
function parseFirstRow(json: string) {
  const parsed = parseJsonQuestions(json);
  const mapping = autoDetectMapping(parsed.headers);
  return parseImportRow(parsed.rows[0], mapping, 2, new Set());
}

describe("parseJsonQuestions", () => {
  it("parses a multiple_choice question with a text correct answer", () => {
    const result = parseFirstRow(
      JSON.stringify([
        {
          question: "What is the capital of France?",
          type: "multiple_choice",
          options: ["London", "Paris", "Berlin", "Madrid"],
          correctAnswer: "Paris",
          subject: "Geography",
          difficulty: "easy",
          points: 1,
          explanation: "Paris has been the capital since 987 AD.",
        },
      ]),
    );
    expect(result.errors).toHaveLength(0);
    expect(result.question?.type).toBe("multiple_choice");
    if (result.question?.type === "multiple_choice") {
      const correct = result.question.options.find((o) => o.isCorrect);
      expect(correct?.text).toBe("Paris");
    }
    expect(result.question?.difficulty).toBe("easy");
    expect(result.question?.points).toBe(1);
  });

  it("defaults type to multiple_choice when omitted", () => {
    const result = parseFirstRow(
      JSON.stringify([
        {
          question: "2 + 2?",
          options: ["3", "4"],
          correctAnswer: "4",
          subject: "Math",
        },
      ]),
    );
    expect(result.question?.type).toBe("multiple_choice");
  });

  it("parses a multiple_answer question with an array correct answer", () => {
    const result = parseFirstRow(
      JSON.stringify([
        {
          question: "Which of these are prime numbers?",
          type: "multiple_answer",
          options: ["2", "4", "5", "9"],
          correctAnswer: ["2", "5"],
          subject: "Math",
        },
      ]),
    );
    expect(result.errors).toHaveLength(0);
    if (result.question?.type === "multiple_answer") {
      const correctTexts = result.question.options
        .filter((o) => o.isCorrect)
        .map((o) => o.text)
        .sort();
      expect(correctTexts).toEqual(["2", "5"]);
    }
  });

  it("treats every option as an accepted answer for short_answer, ignoring correctAnswer", () => {
    const result = parseFirstRow(
      JSON.stringify([
        {
          question: "Capital of Japan?",
          type: "short_answer",
          options: ["Tokyo", "tokyo"],
          subject: "Geography",
        },
      ]),
    );
    expect(result.errors).toHaveLength(0);
    if (result.question?.type === "short_answer") {
      expect(result.question.options.map((o) => o.text)).toEqual([
        "Tokyo",
        "tokyo",
      ]);
    }
  });

  it("flags a question whose correctAnswer doesn't match any option", () => {
    const result = parseFirstRow(
      JSON.stringify([
        {
          question: "What is the capital of France?",
          options: ["London", "Berlin"],
          correctAnswer: "Paris",
          subject: "Geography",
        },
      ]),
    );
    expect(
      result.errors.some((e) => e.startsWith("Invalid correct answer")),
    ).toBe(true);
  });

  it("throws a conflict error for invalid JSON syntax", () => {
    expect(() => parseJsonQuestions("{not valid json")).toThrow();
  });

  it("throws a conflict error when the JSON isn't an array", () => {
    expect(() =>
      parseJsonQuestions(JSON.stringify({ question: "solo object" })),
    ).toThrow();
  });

  it("throws a conflict error for an empty array", () => {
    expect(() => parseJsonQuestions("[]")).toThrow();
  });

  it("throws a conflict error when the batch mixes more than one subject", () => {
    expect(() =>
      parseJsonQuestions(
        JSON.stringify([
          {
            question: "What is the capital of France?",
            options: ["London", "Paris"],
            correctAnswer: "Paris",
            subject: "Geography",
          },
          {
            question: "Which of these are prime numbers?",
            type: "multiple_answer",
            options: ["2", "4"],
            correctAnswer: ["2"],
            subject: "Math",
          },
        ]),
      ),
    ).toThrow(/same subject/);
  });

  it("allows a batch where every question shares the same subject", () => {
    const parsed = parseJsonQuestions(
      JSON.stringify([
        {
          question: "What is the capital of France?",
          options: ["London", "Paris"],
          correctAnswer: "Paris",
          subject: "Geography",
        },
        {
          question: "What is the capital of Japan?",
          options: ["Tokyo", "Osaka"],
          correctAnswer: "Tokyo",
          subject: "Geography",
        },
      ]),
    );
    expect(parsed.rows).toHaveLength(2);
  });

  it("doesn't flag a mixed batch just because some rows omit subject entirely", () => {
    const parsed = parseJsonQuestions(
      JSON.stringify([
        {
          question: "What is the capital of France?",
          options: ["London", "Paris"],
          correctAnswer: "Paris",
          subject: "Geography",
        },
        {
          question: "No subject here",
          options: ["A", "B"],
          correctAnswer: "A",
        },
      ]),
    );
    expect(parsed.rows).toHaveLength(2);
  });

  it("produces headers identical to IMPORT_FIELDS, so mapping is fully automatic", () => {
    const parsed = parseJsonQuestions(
      JSON.stringify([
        {
          question: "Q",
          options: ["A", "B"],
          correctAnswer: "A",
          subject: "S",
        },
      ]),
    );
    const mapping = autoDetectMapping(parsed.headers);
    expect(Object.values(mapping).every((v) => v !== null)).toBe(true);
  });
});
