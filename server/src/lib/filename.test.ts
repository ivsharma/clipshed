import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildOutputBase, isPathInside, sanitizeFilename } from "./filename";

describe("sanitizeFilename", () => {
  it("removes Windows-forbidden characters", () => {
    expect(sanitizeFilename('A/B\\C:D*E?F"G<H>I|J')).toBe("A B C D E F G H I J");
  });

  it("strips trailing dots and spaces", () => {
    expect(sanitizeFilename("hello... ")).toBe("hello");
  });

  it("protects reserved Windows names", () => {
    expect(sanitizeFilename("CON")).toBe("_CON");
    expect(sanitizeFilename("LPT1.txt")).toBe("_LPT1.txt");
  });

  it("falls back for empty input", () => {
    expect(sanitizeFilename("   ", "fallback")).toBe("fallback");
  });

  it("limits length", () => {
    expect(sanitizeFilename("a".repeat(300)).length).toBeLessThanOrEqual(110);
  });
});

describe("buildOutputBase", () => {
  it("adds a readable range suffix", () => {
    expect(buildOutputBase("My Video", { start: 900, end: 1200 }, "id")).toBe(
      "My Video [15m00s-20m00s]",
    );
  });

  it("leaves full downloads clean", () => {
    expect(buildOutputBase("My Video", null, "id")).toBe("My Video");
  });
});

describe("isPathInside", () => {
  it("accepts a child path", () => {
    const parent = path.resolve("C:/data/downloads/job");
    expect(isPathInside(parent, path.join(parent, "file.mp4"))).toBe(true);
  });

  it("rejects a sibling or parent path", () => {
    const parent = path.resolve("C:/data/downloads/job");
    expect(isPathInside(parent, path.resolve("C:/data/downloads/other/file.mp4"))).toBe(false);
    expect(isPathInside(parent, path.resolve("C:/data/downloads/job/../../secret.txt"))).toBe(false);
  });
});
