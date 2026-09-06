import { z } from "zod";

import {
  ALL_QUESTION_TYPES,
  CODE_LANGUAGES,
} from "@/backend/questions/question-types";

const MAX_OPTIONS = 10;
// Generous relative to MAX_OPTIONS — a real test suite for a coding exercise often needs more
// rows than a multiple-choice question ever would.
const MAX_TEST_CASES = 20;

// `.optional()` left as the outermost modifier (not wrapped in `.transform()`) so these stay
// optional *keys* in the inferred type, not required keys typed `string | undefined` — an
// empty string from a blank form field is normalized to `null` in the service layer instead.
const baseQuestionFields = {
  subject: z.string().trim().min(1, "Subject is required").max(200),
  category: z.string().trim().max(200).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  points: z.number().int().min(1).max(1000).default(1),
  text: z.string().trim().min(1, "Question text is required").max(5000),
  explanation: z.string().trim().max(5000).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
};

// Choice-based types: the client marks which option(s) are correct.
const choiceOption = z.object({
  text: z.string().trim().min(1, "Option text is required").max(2000),
  isCorrect: z.boolean(),
});

// Answer-based types (short answer / fill in the blank): every entry is an accepted answer
// variant — there is no "mark as correct" toggle because all of them are correct by definition.
const answerOption = z.object({
  text: z.string().trim().min(1, "Accepted answer is required").max(2000),
});

// numeric_answer: exactly one accepted value, but it must actually parse as a number — unlike
// short_answer's free-text accepted variants.
const numericAnswerOption = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Accepted value is required")
    .refine((v) => Number.isFinite(Number(v)), {
      message: "Accepted value must be a number",
    }),
});

// code_answer, python/javascript only — html/css never execute, so they never have rows here.
// `input`/`expectedOutput` deliberately aren't `.trim()`-normalized on `input`: stdin
// whitespace can be meaningful to a program the way it never is for an accepted text answer.
const testCaseInput = z.object({
  input: z.string().max(10000).default(""),
  expectedOutput: z
    .string()
    .trim()
    .min(1, "Expected output is required")
    .max(10000),
  // Visible to the student's own "Run" — a hidden (non-sample) row only ever executes
  // server-side, at grading, and is never sent to the client (see execution.service.ts).
  isSample: z.boolean().default(false),
});

function correctCount(options: { isCorrect: boolean }[]): number {
  return options.filter((option) => option.isCorrect).length;
}

export const questionInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("multiple_choice"),
    ...baseQuestionFields,
    options: z
      .array(choiceOption)
      .min(2, "Multiple choice needs at least 2 options")
      .max(MAX_OPTIONS)
      .refine((opts) => correctCount(opts) === 1, {
        message: "Multiple choice needs exactly one correct option",
      }),
  }),
  z.object({
    type: z.literal("true_false"),
    ...baseQuestionFields,
    options: z
      .array(choiceOption)
      .length(2, "True/False needs exactly 2 options")
      .refine((opts) => correctCount(opts) === 1, {
        message: "True/False needs exactly one correct option",
      }),
  }),
  z.object({
    type: z.literal("multiple_answer"),
    ...baseQuestionFields,
    options: z
      .array(choiceOption)
      .min(2, "Multiple answer needs at least 2 options")
      .max(MAX_OPTIONS)
      .refine((opts) => correctCount(opts) >= 2, {
        message: "Multiple answer needs at least 2 correct options",
      })
      .refine((opts) => correctCount(opts) < opts.length, {
        message: "Multiple answer needs at least 1 incorrect option",
      }),
  }),
  z.object({
    type: z.literal("short_answer"),
    ...baseQuestionFields,
    options: z
      .array(answerOption)
      .min(1, "At least 1 accepted answer is required")
      .max(MAX_OPTIONS),
  }),
  z.object({
    type: z.literal("fill_in_blank"),
    ...baseQuestionFields,
    options: z
      .array(answerOption)
      .min(1, "At least 1 accepted answer is required")
      .max(MAX_OPTIONS),
  }),
  // No options at all — graded by a teacher reading the submitted prose, never by exact match.
  z.object({
    type: z.literal("essay"),
    ...baseQuestionFields,
    options: z.array(z.never()),
  }),
  z.object({
    type: z.literal("numeric_answer"),
    ...baseQuestionFields,
    options: z
      .array(numericAnswerOption)
      .length(1, "Numeric answer needs exactly 1 accepted value"),
    numericTolerance: z.number().min(0).default(0),
  }),
  // No question_options rows — same convention as essay. Cross-field rules (test cases only for
  // executable languages, previewHtml only for css) live in the .superRefine() below, since a
  // discriminated union's own per-branch object can't see sibling-field values as cleanly.
  z.object({
    type: z.literal("code_answer"),
    ...baseQuestionFields,
    options: z.array(z.never()),
    codeLanguage: z.enum(CODE_LANGUAGES),
    starterCode: z.string().max(20000).optional(),
    // Teacher-only — never sent to a student. Optional: not every question needs a model answer.
    referenceSolution: z.string().max(20000).optional(),
    // codeLanguage: "css" only — the fixed HTML shell the student's CSS previews against.
    previewHtml: z.string().max(20000).optional(),
    testCases: z.array(testCaseInput).max(MAX_TEST_CASES).default([]),
  }),
]).superRefine((val, ctx) => {
  if (val.type !== "code_answer") return;
  const executable = val.codeLanguage === "python" || val.codeLanguage === "javascript";
  if (executable && val.testCases.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["testCases"],
      message: "At least 1 test case is required",
    });
  }
  if (!executable && val.testCases.length > 0) {
    ctx.addIssue({
      code: "custom",
      path: ["testCases"],
      message: "Test cases aren't used for html/css questions",
    });
  }
  if (val.codeLanguage !== "css" && val.previewHtml) {
    ctx.addIssue({
      code: "custom",
      path: ["previewHtml"],
      message: "previewHtml only applies to css questions",
    });
  }
});

export type QuestionInput = z.infer<typeof questionInputSchema>;

export const questionListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  subject: z.string().trim().max(200).optional(),
  category: z.string().trim().max(200).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  type: z.enum(ALL_QUESTION_TYPES).optional(),
  tag: z.string().trim().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type QuestionListQuery = z.infer<typeof questionListQuerySchema>;

// Capped well above a realistic page size (questionListQuerySchema's own pageSize maxes out at
// 100) — bulk delete is driven by an on-screen selection, never an arbitrary id list.
export const bulkDeleteQuestionsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});

export type BulkDeleteQuestionsInput = z.infer<
  typeof bulkDeleteQuestionsSchema
>;
