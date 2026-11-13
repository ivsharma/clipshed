import { describe, expect, it } from "vitest";
import { mapYtDlpError, stripAnsi } from "./errors";

describe("mapYtDlpError", () => {
  it.each([
    ["ERROR: Sign in to confirm you're not a bot", "BOT_CHECK"],
    ["This video is age-restricted", "AGE_RESTRICTED"],
    ["Requested format is not available", "FORMAT_UNAVAILABLE"],
    ["ffmpeg not found. Please install", "FFMPEG_MISSING"],
    ["ERROR: login required to view this post", "LOGIN_REQUIRED"],
    ["ERROR: [Instagram] rate-limit reached", "RATE_LIMITED"],
    ["ERROR: This content isn't available right now", "UNAVAILABLE"],
    ['ERROR: could not find opera cookies database in "C:\\Users\\me\\AppData\\Roaming\\Opera Software\\Opera Stable"', "OPERA_GX_UNSUPPORTED"],
  ])("maps %s to %s", (stderr, code) => {
    expect(mapYtDlpError(stderr).code).toBe(code);
  });

  it("keeps details for unknown errors", () => {
    const error = mapYtDlpError("ERROR: something new broke");
    expect(error.code).toBe("DOWNLOAD_FAILED");
    expect(error.details).toContain("something new broke");
  });
});

describe("stripAnsi", () => {
  it("removes terminal color codes", () => {
    expect(stripAnsi("\u001b[31mred\u001b[0m")).toBe("red");
  });
});
