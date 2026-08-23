import { z } from "zod";

export const loginSchema = z.object({
  // Transform (trim/lowercase) before validating format — chained the other way, `.email()`
  // would reject "  User@Example.com  " for its whitespace before trim() ever ran.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  // 72 bytes is bcrypt's input limit — anything longer is silently truncated, so reject it
  // up front rather than hash a password the user didn't actually type.
  password: z.string().min(1, "Password is required").max(72),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Self-registration is teacher-only for now (Section: "if they don't have account they can
// register for teacher account only") — there's deliberately no `role` field here at all, so a
// client can never request admin/student by posting a different value. Student accounts are
// still created by a teacher (class.service.ts's createStudentInClass) and admin accounts only
// by an existing admin (user.service.ts's createUser).
export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  // Unlike loginSchema's password (which just has to fit what bcrypt can hash), a *new*
  // password needs a minimum length — matches user.schema.ts's passwordSchema policy for every
  // other account-creation path in the app.
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
