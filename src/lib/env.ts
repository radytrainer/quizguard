import { z } from "zod";

/**
 * `KEY=` in an .env file loads as an empty string, not undefined — without this, an unset
 * optional var would fail `.min(1)` instead of being treated as absent.
 */
const optionalString = () =>
  z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().min(1).optional(),
  );

/**
 * Vars beyond NODE_ENV/DATABASE_URL/REDIS_URL are optional here because nothing reads them
 * yet — they become required in the phase that introduces their feature. Phase 1 sessions are
 * opaque Redis-backed tokens (see backend/auth/session.ts), not signed/encrypted cookies, so
 * AUTH_SECRET has no consumer yet. GOOGLE_CLIENT_* is Phase 5 (Sheets import), SENTRY_DSN is
 * Phase 11. APP_URL/REALTIME_PORT/NEXT_PUBLIC_REALTIME_URL are Phase 9 (see
 * docs/ARCHITECTURE.md — Section 12: the realtime server is a separate Node process, not
 * something Next's `output: "standalone"` build can host in-process, so it needs its own
 * origin/port for CORS and for the browser to connect to).
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  AUTH_SECRET: optionalString(),
  GOOGLE_CLIENT_ID: optionalString(),
  GOOGLE_CLIENT_SECRET: optionalString(),
  SENTRY_DSN: optionalString(),
  APP_URL: z.string().min(1).default("http://localhost:3000"),
  REALTIME_PORT: z.coerce.number().int().min(1).default(4001),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = parseEnv(process.env);
