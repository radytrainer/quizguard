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
    textAnswer: z.string().max(2000),
  }),
]);

export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;
