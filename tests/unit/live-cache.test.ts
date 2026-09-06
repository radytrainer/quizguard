import RedisMock from "ioredis-mock";
import { beforeEach, describe, expect, it } from "vitest";

import {
  clearSessionCache,
  getRosterCount,
  incrAnsweredCount,
  setRosterCount,
} from "@/backend/live/live-cache";

describe("live-cache", () => {
  let client: InstanceType<typeof RedisMock>;

  beforeEach(() => {
    client = new RedisMock();
  });

  describe("roster count", () => {
    it("misses until a count is set", async () => {
      // ioredis-mock implements the ioredis surface these functions actually call
      // (get/set/incr/expire/del); the two packages just don't share a TS declaration.
      expect(await getRosterCount("session-1", client as never)).toBeNull();
    });

    it("round-trips a count that was set", async () => {
      await setRosterCount("session-1", 12, client as never);
      expect(await getRosterCount("session-1", client as never)).toBe(12);
    });

    it("keeps sessions independent", async () => {
      await setRosterCount("session-1", 12, client as never);
      await setRosterCount("session-2", 3, client as never);
      expect(await getRosterCount("session-1", client as never)).toBe(12);
      expect(await getRosterCount("session-2", client as never)).toBe(3);
    });
  });

  describe("answered count", () => {
    it("starts at 1 and increments per call", async () => {
      expect(await incrAnsweredCount("session-1", 0, client as never)).toBe(1);
      expect(await incrAnsweredCount("session-1", 0, client as never)).toBe(2);
      expect(await incrAnsweredCount("session-1", 0, client as never)).toBe(3);
    });

    it("keeps each question index independent", async () => {
      await incrAnsweredCount("session-1", 0, client as never);
      await incrAnsweredCount("session-1", 0, client as never);
      expect(await incrAnsweredCount("session-1", 1, client as never)).toBe(1);
    });
  });

  describe("clearSessionCache", () => {
    it("removes the roster count and every question's answered count", async () => {
      await setRosterCount("session-1", 10, client as never);
      await incrAnsweredCount("session-1", 0, client as never);
      await incrAnsweredCount("session-1", 1, client as never);

      await clearSessionCache("session-1", 2, client as never);

      expect(await getRosterCount("session-1", client as never)).toBeNull();
      expect(await incrAnsweredCount("session-1", 0, client as never)).toBe(1);
      expect(await incrAnsweredCount("session-1", 1, client as never)).toBe(1);
    });

    it("leaves other sessions untouched", async () => {
      await setRosterCount("session-1", 10, client as never);
      await setRosterCount("session-2", 5, client as never);

      await clearSessionCache("session-1", 0, client as never);

      expect(await getRosterCount("session-2", client as never)).toBe(5);
    });
  });
});
