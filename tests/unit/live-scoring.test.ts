import { describe, expect, it } from "vitest";

import { computeSpeedPoints } from "@/backend/live/live-scoring";

describe("computeSpeedPoints", () => {
  it("awards 0 for an incorrect answer regardless of speed", () => {
    expect(computeSpeedPoints(0, 20000, false)).toBe(0);
    expect(computeSpeedPoints(19999, 20000, false)).toBe(0);
  });

  it("awards the full 1000 for an instant correct answer", () => {
    expect(computeSpeedPoints(0, 20000, true)).toBe(1000);
  });

  it("awards half (500) for a correct answer right at the time limit", () => {
    expect(computeSpeedPoints(20000, 20000, true)).toBe(500);
  });

  it("scales linearly between the max and half for a correct answer", () => {
    // Halfway through the window: 50% remaining -> 0.5 + 0.5*0.5 = 0.75 -> 750
    expect(computeSpeedPoints(10000, 20000, true)).toBe(750);
  });

  it("clamps elapsed time so a late or clock-skewed submission never drops below 500 or exceeds 1000", () => {
    expect(computeSpeedPoints(50000, 20000, true)).toBe(500);
    expect(computeSpeedPoints(-100, 20000, true)).toBe(1000);
  });
});
