import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatDuration,
  formatRangeSlug,
  formatSectionTimestamp,
  parseTime,
} from "./time";

describe("parseTime", () => {
  it.each([
    ["90", 90],
    ["1:30", 90],
    ["01:02:03", 3723],
    ["01:02:03.5", 3723.5],
    ["1h2m3s", 3723],
    ["1h 2m 3s", 3723],
    ["2m", 120],
    ["30s", 30],
    ["0", 0],
    [" 15:00 ", 900],
  ])("parses %s as %d", (input, expected) => {
    expect(parseTime(input)).toBe(expected);
  });

  it.each(["", "abc", "1:60", "1:2:3:4", "1h 2m junk", "-1", "1m30"])(
    "rejects %s",
    (input) => {
      expect(parseTime(input)).toBeNull();
    },
  );
});

describe("formatClock", () => {
  it("formats under an hour", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(90)).toBe("1:30");
  });

  it("formats hours", () => {
    expect(formatClock(3723)).toBe("1:02:03");
  });
});

describe("formatDuration", () => {
  it("uses friendly units", () => {
    expect(formatDuration(30)).toBe("30s");
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(3723)).toBe("1h 02m 03s");
  });
});

describe("formatRangeSlug", () => {
  it("builds a filename-friendly range", () => {
    expect(formatRangeSlug(900, 1200)).toBe("15m00s-20m00s");
    expect(formatRangeSlug(3723, 3730)).toBe("1h02m03s-1h02m10s");
  });
});

describe("formatSectionTimestamp", () => {
  it("formats yt-dlp section timestamps", () => {
    expect(formatSectionTimestamp(900)).toBe("00:15:00.000");
    expect(formatSectionTimestamp(90.5)).toBe("00:01:30.500");
  });
});
