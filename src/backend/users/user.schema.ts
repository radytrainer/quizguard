import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .email("Enter a valid email address");

// 72 bytes is bcrypt's input limit — see auth.schema.ts's loginSchema for the same reasoning.
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters");

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1, "Name is required").max(200),
  role: z.enum(["admin", "teacher", "student"]),
  // Only meaningful when role is "student"; ignored otherwise (see user.service.ts).
  studentNumber: z.string().trim().max(50).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({ password: passwordSchema });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const userListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  role: z.enum(["admin", "teacher", "student"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type UserListQuery = z.infer<typeof userListQuerySchema>;
