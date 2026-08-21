import { z } from "zod";

export const quizInputSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(300),
    description: z.string().trim().max(2000).optional(),
    subject: z.string().trim().min(1, "Subject is required").max(200),
    durationMinutes: z
      .number()
      .int()
      .min(1, "Duration must be at least 1 minute")
      .max(600),
    passingScore: z.number().int().min(0).max(100),
    maxAttempts: z.number().int().min(1).max(20),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
    randomizeQuestions: z.boolean().default(false),
    randomizeOptions: z.boolean().default(false),
    fullscreenRequired: z.boolean().default(false),
    monitorActivity: z.boolean().default(false),
    autoSave: z.boolean().default(true),
    autoSubmit: z.boolean().default(true),
    showResults: z.boolean().default(true),
    questionsPerAttempt: z
      .number()
      .int()
      .min(1, "At least 1 question is required")
      .max(500),
  })
  .refine((data) => !data.startAt || !data.endAt || data.startAt < data.endAt, {
    message: "End date must be after start date",
    path: ["endAt"],
  });

export type QuizInput = z.infer<typeof quizInputSchema>;

export const quizListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  subject: z.string().trim().max(200).optional(),
  // "scheduled" isn't a stored status (see QuizDisplayStatus in quiz.service.ts) — it's
  // `published` with a future `startAt`. listQuizzes() translates it into that condition so
  // filtering by it still works correctly with pagination, not just client-side display.
  status: z.enum(["draft", "published", "scheduled", "archived"]).optional(),
  classId: z.string().uuid().optional(),
  // Calendar-day match against the quiz's own startAt — a plain date, not a timestamp, since
  // the filter UI is a single date picker, not a time range.
  date: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type QuizListQuery = z.infer<typeof quizListQuerySchema>;

export const quizQuestionPoolSchema = z.object({
  questionIds: z
    .array(z.string().uuid())
    .min(1, "A quiz needs at least 1 pooled question")
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Duplicate question IDs are not allowed",
    }),
});

export type QuizQuestionPoolInput = z.infer<typeof quizQuestionPoolSchema>;
