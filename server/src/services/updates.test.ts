import { describe, expect, it } from "vitest";
import { compareVersions, parseVersion, selectLatestRelease, type GitHubRelease } from "./updates";

const release = (tag: string, overrides: Partial<GitHubRelease> = {}): GitHubRelease => ({
  tag_name: tag,
  name: null,
  html_url: `https://example.test/releases/${tag}`,
  draft: false,
  prerelease: false,
  published_at: null,
  ...overrides,
});

describe("parseVersion", () => {
  it("parses tags with a v prefix", () => {
    expect(parseVersion("v1.2.3")).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] });
  });

  it("parses pre-release identifiers", () => {
    expect(parseVersion("1.2.3-beta.1")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: ["beta", "1"],
    });
  });

  it.each(["dev", "1.2", "1.2.x", "1.2.3-"])("rejects %s", (value) => {
    expect(parseVersion(value)).toBeNull();
  });
});

describe("compareVersions", () => {
  it.each([
    ["1.0.1", "1.0.0", 1],
    ["1.10.0", "1.9.9", 1],
    ["1.0.0", "1.0.0", 0],
    ["1.0.0-beta.2", "1.0.0", -1],
    ["1.0.0-beta.10", "1.0.0-beta.2", 1],
    ["v2.0.0", "1.99.99", 1],
  ])("compares %s to %s", (left, right, expected) => {
    expect(compareVersions(left, right)).toBe(expected);
  });
});

describe("selectLatestRelease", () => {
  it("picks the highest non-draft release", () => {
    const latest = selectLatestRelease([
      release("v1.0.1"),
      release("v1.2.0"),
      release("v1.1.0"),
      release("v9.9.9", { draft: true }),
    ]);

    expect(latest?.tag_name).toBe("v1.2.0");
  });

  it("includes pre-releases for this project's release flow", () => {
    const latest = selectLatestRelease([release("v1.0.2"), release("v1.1.0-beta.1", { prerelease: true })]);
    expect(latest?.tag_name).toBe("v1.1.0-beta.1");
  });

  it("ignores tags that are not semantic versions", () => {
    const latest = selectLatestRelease([release("nightly"), release("v1.0.0")]);
    expect(latest?.tag_name).toBe("v1.0.0");
  });

  it("returns null when there are no usable releases", () => {
    expect(selectLatestRelease([])).toBeNull();
    expect(selectLatestRelease([release("latest")])).toBeNull();
  });
});
