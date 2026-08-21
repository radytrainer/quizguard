import { describe, expect, it } from "vitest";

import { recordViolationSchema } from "@/backend/monitoring/monitoring.schema";

describe("recordViolationSchema", () => {
  it("accepts each known violation type", () => {
    for (const type of ["fullscreen_exit", "tab_switch", "copy_paste"]) {
      expect(recordViolationSchema.safeParse({ type }).success).toBe(true);
    }
  });

  it("rejects an unknown violation type", () => {
    expect(
      recordViolationSchema.safeParse({ type: "screen_recording" }).success,
    ).toBe(false);
  });

  it("rejects a missing type", () => {
    expect(recordViolationSchema.safeParse({}).success).toBe(false);
  });
});
