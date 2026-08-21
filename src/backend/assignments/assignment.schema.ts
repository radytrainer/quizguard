import { z } from "zod";

export const assignmentInputSchema = z
  .object({
    classId: z.string().uuid().optional(),
    studentId: z.string().uuid().optional(),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
  })
  .refine((data) => Boolean(data.classId) !== Boolean(data.studentId), {
    message: "Assign to exactly one class or one student",
    path: ["classId"],
  })
  .refine((data) => !data.startAt || !data.endAt || data.startAt < data.endAt, {
    message: "End date must be after start date",
    path: ["endAt"],
  });

export type AssignmentInput = z.infer<typeof assignmentInputSchema>;
