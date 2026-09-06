import { z } from "zod";

export const runCodeSchema = z.object({
  questionId: z.string().uuid(),
  code: z.string().max(20000),
});

export type RunCodeInput = z.infer<typeof runCodeSchema>;
