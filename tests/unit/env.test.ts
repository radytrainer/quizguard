import { describe, expect, it } from "vitest";

import { parseEnv } from "@/lib/env";

describe("parseEnv", () => {
  it("parses a valid environment and applies the NODE_ENV default", () => {
    const env = parseEnv({
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      REDIS_URL: "redis://localhost:6379",
    });

    expect(env.NODE_ENV).toBe("development");
    expect(env.DATABASE_URL).toBe("postgresql://user:pass@localhost:5432/db");
  });

  it("throws a descriptive error when DATABASE_URL is missing", () => {
    expect(() => parseEnv({ REDIS_URL: "redis://localhost:6379" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("throws a descriptive error when REDIS_URL is missing", () => {
    expect(() =>
      parseEnv({ DATABASE_URL: "postgresql://localhost:5432/db" }),
    ).toThrow(/REDIS_URL/);
  });

  it("treats an empty-string optional var (as loaded from `KEY=` in an .env file) as unset", () => {
    const env = parseEnv({
      DATABASE_URL: "postgresql://localhost:5432/db",
      REDIS_URL: "redis://localhost:6379",
      AUTH_SECRET: "",
    });

    expect(env.AUTH_SECRET).toBeUndefined();
  });

  it("rejects an invalid NODE_ENV value", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "staging",
        DATABASE_URL: "postgresql://localhost:5432/db",
        REDIS_URL: "redis://localhost:6379",
      }),
    ).toThrow();
  });
});
