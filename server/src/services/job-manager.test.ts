import { describe, expect, it } from "vitest";
import { validateRange } from "./job-manager";

describe("validateRange", () => {
  it("returns null for a full download under the length limit", () => {
    expect(validateRange(null, 600)).toBeNull();
  });

  it("rounds and clamps a valid range", () => {
    expect(validateRange({ start: 900.0004, end: 1300 }, 3600)).toEqual({ start: 900, end: 1300 });
    expect(validateRange({ start: 10, end: 60.5 }, 60)).toEqual({ start: 10, end: 60 });
  });

  it("rejects ranges that are too short, out of bounds, or missing a duration", () => {
    expect(() => validateRange({ start: 5, end: 5.5 }, 60)).toThrow("at least one second");
    expect(() => validateRange({ start: 60, end: 90 }, 60)).toThrow("at or past the end");
    expect(() => validateRange({ start: 0, end: 90 }, 60)).toThrow("past the end");
    expect(() => validateRange({ start: 0, end: 10 }, null)).toThrow("doesn't report a duration");
  });
});
