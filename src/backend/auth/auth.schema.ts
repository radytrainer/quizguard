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
