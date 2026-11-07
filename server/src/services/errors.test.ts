import { describe, expect, it } from "vitest";
import { mapYtDlpError, stripAnsi } from "./errors";

describe("mapYtDlpError", () => {
  it("maps bot checks", () => {
    expect(
      mapYtDlpError("ERROR: Sign in to confirm you're not a bot").code,
    ).toBe("BOT_CHECK");
  });

  it("maps age restrictions", () => {
    expect(mapYtDlpError("This video is age-restricted").code).toBe(
      "AGE_RESTRICTED",
    );
  });

  it("maps format errors", () => {
    expect(
      mapYtDlpError("Requested format is not available").code,
    ).toBe("FORMAT_UNAVAILABLE");
  });

  it("maps missing ffmpeg", () => {
    expect(mapYtDlpError("ffmpeg not found. Please install").code).toBe(
      "FFMPEG_MISSING",
    );
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
