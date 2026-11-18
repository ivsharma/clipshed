import { existsSync } from "node:fs";
import type { Health } from "@clipshed/shared";
import { config } from "../config";
import { AppError } from "../errors";
import { log } from "../lib/logger";
import { runCommand } from "../lib/process";
import { getSettings, isCookiesConfigured } from "./settings";

interface Versions {
  ytdlp: string | null;
  ffmpeg: string | null;
}

let versionCache: { versions: Versions; expiresAt: number } | null = null;

async function firstLineOf(binary: string, args: string[]): Promise<string | null> {
  if (!existsSync(binary)) return null;
  try {
    const result = await runCommand(binary, args, { timeoutMs: 20_000 });
    return result.code === 0 ? (result.stdout.trim().split(/\r?\n/)[0] ?? null) : null;
  } catch (error) {
    log.warn(`Could not read version for ${binary}.`, error);
    return null;
  }
}

async function getVersions(): Promise<Versions> {
  if (versionCache && versionCache.expiresAt > Date.now()) return versionCache.versions;

  const versions: Versions = {
    ytdlp: await firstLineOf(config.ytdlpPath, ["--version"]),
    ffmpeg: await firstLineOf(config.ffmpegPath, ["-version"]),
  };
  versionCache = { versions, expiresAt: Date.now() + 60_000 };
  return versions;
}

export function binariesExist(): boolean {
  return [config.ytdlpPath, config.ffmpegPath].every((file) => existsSync(file));
}

export function assertBinaries(): void {
  if (!binariesExist()) {
    throw new AppError(
      "BINARY_MISSING",
      "yt-dlp or ffmpeg is missing. Run `npm run setup` from the project root, then restart the app.",
      500,
    );
  }
}

export async function getHealth(): Promise<Health> {
  const [versions, settings] = await Promise.all([getVersions(), getSettings()]);
  return {
    ok: Boolean(versions.ytdlp && versions.ffmpeg),
    appVersion: config.appVersion,
    ytdlpVersion: versions.ytdlp,
    ffmpegVersion: versions.ffmpeg,
    nodeVersion: process.version,
    binariesOk: binariesExist(),
    cookiesConfigured: isCookiesConfigured(settings),
  };
}

let updating: Promise<{ ok: boolean; output: string }> | null = null;

/** Runs `yt-dlp -U`. Concurrent calls share one update. */
export function updateYtDlp(): Promise<{ ok: boolean; output: string }> {
  updating ??= (async () => {
    if (!existsSync(config.ytdlpPath)) {
      throw new AppError("BINARY_MISSING", "yt-dlp isn't installed. Run `npm run setup` first.", 500);
    }
    const result = await runCommand(config.ytdlpPath, ["-U"], { timeoutMs: 180_000, cwd: config.rootDir });
    versionCache = null;
    return { ok: result.code === 0, output: `${result.stdout}\n${result.stderr}`.trim() };
  })().finally(() => {
    updating = null;
  });
  return updating;
}
