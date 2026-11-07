import { existsSync } from "node:fs";
import type { Health } from "@clipshed/shared";
import { config } from "../config";
import { runCommand } from "../lib/process";
import { log } from "../lib/logger";
import { AppError } from "./errors";
import { getSettings, isCookiesConfigured } from "./settings";

interface Versions {
  ytdlp: string | null;
  ffmpeg: string | null;
}

let cached: { versions: Versions; expiresAt: number } | null = null;
let updatePromise: Promise<{ ok: boolean; output: string }> | null = null;

export async function getVersions(force = false): Promise<Versions> {
  if (!force && cached && cached.expiresAt > Date.now()) {
    return cached.versions;
  }

  const versions: Versions = { ytdlp: null, ffmpeg: null };

  if (existsSync(config.ytdlpPath)) {
    try {
      const result = await runCommand(config.ytdlpPath, ["--version"], {
        timeoutMs: 20_000,
      });
      versions.ytdlp = result.code === 0 ? result.stdout.trim().split(/\r?\n/)[0] : null;
    } catch (error) {
      log.warn("Could not read yt-dlp version.", error);
    }
  }

  if (existsSync(config.ffmpegPath)) {
    try {
      const result = await runCommand(config.ffmpegPath, ["-version"], {
        timeoutMs: 20_000,
      });
      versions.ffmpeg =
        result.code === 0 ? result.stdout.trim().split(/\r?\n/)[0] : null;
    } catch (error) {
      log.warn("Could not read ffmpeg version.", error);
    }
  }

  cached = {
    versions,
    expiresAt: Date.now() + 60_000,
  };
  return versions;
}

export function binariesExist(): boolean {
  return (
    existsSync(config.ytdlpPath) &&
    existsSync(config.ffmpegPath) &&
    existsSync(config.ffprobePath)
  );
}

export async function assertBinaries(): Promise<void> {
  if (!binariesExist()) {
    throw new AppError(
      "BINARY_MISSING",
      "yt-dlp or ffmpeg is missing. Run `npm run setup` from the project root, then restart the app.",
      500,
    );
  }
}

export async function getHealth(): Promise<Health> {
  const versions = await getVersions();
  const settings = await getSettings();

  return {
    ok: Boolean(versions.ytdlp && versions.ffmpeg),
    ytdlpVersion: versions.ytdlp,
    ffmpegVersion: versions.ffmpeg,
    nodeVersion: process.version,
    jsRuntime: "node",
    binariesOk: binariesExist(),
    cookiesConfigured: isCookiesConfigured(settings),
    ytdlpPath: config.ytdlpPath,
    ffmpegPath: config.ffmpegPath,
  };
}

export function updateYtDlp(): Promise<{ ok: boolean; output: string }> {
  if (updatePromise) return updatePromise;

  updatePromise = (async () => {
    if (!existsSync(config.ytdlpPath)) {
      throw new AppError(
        "BINARY_MISSING",
        "yt-dlp isn't installed. Run `npm run setup` first.",
        500,
      );
    }

    const result = await runCommand(config.ytdlpPath, ["-U"], {
      timeoutMs: 180_000,
      cwd: config.rootDir,
    });

    cached = null;
    const output = `${result.stdout}\n${result.stderr}`.trim();
    return { ok: result.code === 0, output };
  })().finally(() => {
    updatePromise = null;
  });

  return updatePromise;
}
