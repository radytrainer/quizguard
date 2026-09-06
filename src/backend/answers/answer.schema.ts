import { z } from "zod";

// Which shape is valid depends on the question's type (choice types vs. free-text types) —
// answer.service.ts cross-checks the chosen shape against the actual question after looking it
// up, since that requires a DB read this schema can't do.
export const saveAnswerSchema = z.union([
  z.object({
    questionId: z.string().uuid(),
    selectedOptionIds: z.array(z.string().uuid()).max(10),
  }),
  z.object({
    questionId: z.string().uuid(),
    // 2000 was plenty for a short_answer/fill_in_blank word or phrase; essay prose and
    // (Phase 16) submitted source code both need far more room.
    textAnswer: z.string().max(20000),
  }),
]);

export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;

// A teacher manually grading one answer — essay always, code_answer (Phase 16) for html/css,
// or an override of any already auto-graded answer. `pointsAwarded` is clamped to
// [0, question.points] in answer.service.ts#gradeAnswer, which requires reading the question
// first — not something this schema alone can express.
export const gradeAnswerSchema = z.object({
  pointsAwarded: z.number().int().min(0),
  feedback: z.string().trim().max(5000).optional(),
});

export type GradeAnswerInput = z.infer<typeof gradeAnswerSchema>;
