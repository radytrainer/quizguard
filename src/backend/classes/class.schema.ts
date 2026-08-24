import { z } from "zod";

import { emailSchema, passwordSchema } from "@/backend/users/user.schema";

export const classInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  // Admin only: assigns the class to a specific teacher. Teachers creating their own class
  // never send this — the service defaults it to the caller (see class.service.ts).
  teacherId: z.string().uuid().optional(),
});

export type ClassInput = z.infer<typeof classInputSchema>;

export const classListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ClassListQuery = z.infer<typeof classListQuerySchema>;

export const rosterAddSchema = z.object({
  studentId: z.string().uuid(),
});

export type RosterAddInput = z.infer<typeof rosterAddSchema>;

export const genderValues = ["male", "female", "other"] as const;

// Creates a brand-new student account directly enrolled in this class — distinct from
// rosterAddSchema, which only attaches an already-existing student.
export const createStudentSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: emailSchema,
  password: passwordSchema,
  gender: z.enum(genderValues),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;

// A teacher editing an existing student's profile — no email/password here (unlike
// createStudentSchema): changing a login credential is a bigger, separate concern than
// updating a roster profile, and admin's own updateUserSchema doesn't touch email either.
export const updateStudentSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  studentNumber: z.string().trim().max(50).optional(),
  gender: z.enum(genderValues).optional(),
});

export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
