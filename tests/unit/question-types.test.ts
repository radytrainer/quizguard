import { describe, expect, it } from "vitest";

import {
  ALL_QUESTION_TYPES,
  CHOICE_QUESTION_TYPES,
  IMPORTABLE_QUESTION_TYPES,
  LIVE_QUESTION_TYPES,
  QUESTION_TYPES,
  needsManualGrading,
} from "@/backend/questions/question-types";

// Direct regression coverage for the exact drift class that motivated this registry:
// exam-attempt.tsx's own CHOICE_TYPES set once silently omitted multiple_answer. These
// assertions pin down membership explicitly rather than just checking internal consistency, so
// a future accidental edit to the registry itself fails loudly too.
describe("question-types registry", () => {
  it("has exactly one metadata entry per declared type, keyed to itself", () => {
    for (const type of ALL_QUESTION_TYPES) {
      expect(QUESTION_TYPES[type].type).toBe(type);
    }
  });

  it("marks only the three choice-based types as choice", () => {
    expect(new Set(CHOICE_QUESTION_TYPES)).toEqual(
      new Set(["multiple_choice", "true_false", "multiple_answer"]),
    );
  });

  it("marks only multiple_answer as multi-select", () => {
    const multiSelect = ALL_QUESTION_TYPES.filter(
      (t) => QUESTION_TYPES[t].isMultiSelect,
    );
    expect(multiSelect).toEqual(["multiple_answer"]);
  });

  it("restricts the live game to the three choice-based types", () => {
    expect(new Set(LIVE_QUESTION_TYPES)).toEqual(
      new Set(["multiple_choice", "true_false", "multiple_answer"]),
    );
  });

  it("excludes code_answer from bulk import, includes everything else", () => {
    expect(IMPORTABLE_QUESTION_TYPES).not.toContain("code_answer");
    expect(IMPORTABLE_QUESTION_TYPES).toHaveLength(ALL_QUESTION_TYPES.length - 1);
  });
});

describe("needsManualGrading", () => {
  it("is true for essay", () => {
    expect(needsManualGrading({ type: "essay" })).toBe(true);
  });

  it("is false for every auto-gradable type", () => {
    for (const type of ALL_QUESTION_TYPES) {
      if (type === "essay" || type === "code_answer") continue;
      expect(needsManualGrading({ type })).toBe(false);
    }
  });

  it("is true for code_answer only when the language is html or css", () => {
    expect(needsManualGrading({ type: "code_answer", codeLanguage: "html" })).toBe(
      true,
    );
    expect(needsManualGrading({ type: "code_answer", codeLanguage: "css" })).toBe(
      true,
    );
    expect(
      needsManualGrading({ type: "code_answer", codeLanguage: "python" }),
    ).toBe(false);
    expect(
      needsManualGrading({ type: "code_answer", codeLanguage: "javascript" }),
    ).toBe(false);
  });
});
