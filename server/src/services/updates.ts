import type { ReleaseInfo, UpdateCheck } from "@clipshed/shared";
import { config } from "../config";
import { AppError } from "../errors";

const REPO = "ivsharma/clipshed";
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases?per_page=30`;
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

export interface GitHubRelease {
  tag_name: string;
  name: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
}

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

/** Parses a SemVer tag such as `v1.2.3` or `1.2.3-beta.1`. */
export function parseVersion(value: string): ParsedVersion | null {
  const cleaned = (value.trim().replace(/^v/i, "").split("+")[0] ?? "").trim();
  if (!cleaned) return null;

  const dash = cleaned.indexOf("-");
  const core = dash === -1 ? cleaned : cleaned.slice(0, dash);
  const pre = dash === -1 ? "" : cleaned.slice(dash + 1);
  if (dash !== -1 && !pre) return null;

  const parts = core.split(".");
  if (parts.length !== 3) return null;

  const [major, minor, patch] = parts;
  if (!major || !minor || !patch) return null;
  if (![major, minor, patch].every((part) => /^\d+$/.test(part))) return null;

  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: pre ? pre.split(".") : [],
  };
}

/** SemVer comparison. Returns -1, 0, or 1; invalid versions compare equal. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;

  const core = left.major - right.major || left.minor - right.minor || left.patch - right.patch;
  if (core !== 0) return core > 0 ? 1 : -1;

  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;

  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];

    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;

    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);

    if (leftNumeric && rightNumeric) {
      const diff = Number(leftPart) - Number(rightPart);
      if (diff !== 0) return diff > 0 ? 1 : -1;
      continue;
    }

    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart > rightPart ? 1 : -1;
  }

  return 0;
}

/** Picks the highest non-draft release, including pre-releases. */
export function selectLatestRelease(releases: GitHubRelease[]): GitHubRelease | null {
  let latest: GitHubRelease | null = null;

  for (const release of releases) {
    if (release.draft || !parseVersion(release.tag_name)) continue;
    if (!latest || compareVersions(release.tag_name, latest.tag_name) > 0) latest = release;
  }

  return latest;
}

let cached: { result: UpdateCheck; expiresAt: number } | null = null;
let pending: Promise<UpdateCheck> | null = null;

/** Queries the public GitHub releases. Successful results are cached for 10 minutes. */
export function checkForUpdates(): Promise<UpdateCheck> {
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.result);

  pending ??= fetchLatestRelease()
    .then((result) => {
      cached = { result, expiresAt: Date.now() + CACHE_TTL_MS };
      return result;
    })
    .finally(() => {
      pending = null;
    });

  return pending;
}

async function fetchLatestRelease(): Promise<UpdateCheck> {
  let response: Response;
  try {
    response = await fetch(RELEASES_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `Clipshed/${config.appVersion}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new AppError(
      "UPDATE_CHECK_FAILED",
      "Could not reach GitHub to check for updates.",
      502,
      error instanceof Error ? error.message : String(error),
    );
  }

  if (!response.ok) {
    throw new AppError(
      "UPDATE_CHECK_FAILED",
      "GitHub returned an error while checking for updates.",
      502,
      `HTTP ${response.status}`,
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!Array.isArray(payload)) {
    throw new AppError("UPDATE_CHECK_FAILED", "GitHub returned an unexpected response.", 502);
  }

  const releases = payload.filter(
    (item): item is GitHubRelease =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as GitHubRelease).tag_name === "string" &&
      typeof (item as GitHubRelease).html_url === "string" &&
      typeof (item as GitHubRelease).draft === "boolean" &&
      typeof (item as GitHubRelease).prerelease === "boolean" &&
      (typeof (item as GitHubRelease).name === "string" || (item as GitHubRelease).name === null) &&
      (typeof (item as GitHubRelease).published_at === "string" ||
        (item as GitHubRelease).published_at === null),
  );

  const latest = selectLatestRelease(releases);
  const currentVersion = versionFromTag(config.appVersion);

  return {
    currentVersion,
    latest: latest ? toReleaseInfo(latest) : null,
    updateAvailable: latest ? compareVersions(latest.tag_name, currentVersion) > 0 : false,
    checkedAt: new Date().toISOString(),
  };
}

function versionFromTag(tag: string): string {
  return (tag.trim().replace(/^v/i, "").split("+")[0] ?? tag).trim();
}

function toReleaseInfo(release: GitHubRelease): ReleaseInfo {
  return {
    version: versionFromTag(release.tag_name),
    tag: release.tag_name,
    name: release.name?.trim() || release.tag_name,
    url: release.html_url,
    publishedAt: release.published_at,
    prerelease: release.prerelease,
  };
}
