import RedisMock from "ioredis-mock";
import { beforeEach, describe, expect, it } from "vitest";

import { checkRateLimit } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  let client: InstanceType<typeof RedisMock>;

  beforeEach(() => {
    client = new RedisMock();
  });

  it("allows requests under the limit", async () => {
    const result = await checkRateLimit(
      "test-key",
      { limit: 3, windowSeconds: 60 },
      // ioredis-mock implements the ioredis surface this function actually calls
      // (incr/expire/ttl); the two packages just don't share a TS declaration.
      client as never,
    );

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("blocks requests once the limit is exceeded", async () => {
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(
        "test-key",
        { limit: 3, windowSeconds: 60 },
        client as never,
      );
    }

    const result = await checkRateLimit(
      "test-key",
      { limit: 3, windowSeconds: 60 },
      client as never,
    );

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("tracks separate keys independently", async () => {
    await checkRateLimit(
      "key-a",
      { limit: 1, windowSeconds: 60 },
      client as never,
    );
    const resultA = await checkRateLimit(
      "key-a",
      { limit: 1, windowSeconds: 60 },
      client as never,
    );
    const resultB = await checkRateLimit(
      "key-b",
      { limit: 1, windowSeconds: 60 },
      client as never,
    );

    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(true);
  });
});
