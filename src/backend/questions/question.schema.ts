import { z } from "zod";

const MAX_OPTIONS = 10;

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
]);

export type QuestionInput = z.infer<typeof questionInputSchema>;

export const questionListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  subject: z.string().trim().max(200).optional(),
  category: z.string().trim().max(200).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  type: z
    .enum([
      "multiple_choice",
      "true_false",
      "multiple_answer",
      "short_answer",
      "fill_in_blank",
    ])
    .optional(),
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
