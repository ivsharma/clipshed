import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(here, "../..");

dotenv.config({ path: path.join(ROOT_DIR, ".env"), quiet: true });

function resolveFromRoot(value: string | undefined, fallback: string): string {
  if (!value) return path.join(ROOT_DIR, fallback);
  return path.isAbsolute(value) ? value : path.resolve(ROOT_DIR, value);
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const dataDir = resolveFromRoot(process.env.DATA_DIR, "data");
const binDir = resolveFromRoot(process.env.BIN_DIR, "bin");
const isWindows = process.platform === "win32";

export const config = {
  rootDir: ROOT_DIR,
  host: process.env.HOST ?? "127.0.0.1",
  port: numberFromEnv(process.env.PORT, 3000),

  dataDir,
  downloadsDir: path.join(dataDir, "downloads"),
  tempDir: path.join(dataDir, "tmp"),
  historyFile: path.join(dataDir, "jobs.json"),
  settingsFile: path.join(dataDir, "settings.json"),

  binDir,
  ytdlpPath: process.env.YTDLP_PATH
    ? resolveFromRoot(process.env.YTDLP_PATH, `bin/${isWindows ? "yt-dlp.exe" : "yt-dlp"}`)
    : path.join(binDir, isWindows ? "yt-dlp.exe" : "yt-dlp"),
  ffmpegDir: resolveFromRoot(process.env.FFMPEG_DIR, "bin"),
  ffmpegPath: path.join(binDir, isWindows ? "ffmpeg.exe" : "ffmpeg"),
  ffprobePath: path.join(binDir, isWindows ? "ffprobe.exe" : "ffprobe"),

  webDist: path.join(ROOT_DIR, "web", "dist"),

  maxConcurrentJobs: Math.min(3, numberFromEnv(process.env.MAX_CONCURRENT_JOBS, 1)),
  jobTtlHours: numberFromEnv(process.env.JOB_TTL_HOURS, 24),
  maxVideoDurationSeconds: 6 * 60 * 60,
  probeCacheTtlMs: 10 * 60 * 1000,
} as const;

export async function ensureDirs(): Promise<void> {
  await Promise.all([
    fs.mkdir(config.dataDir, { recursive: true }),
    fs.mkdir(config.downloadsDir, { recursive: true }),
    fs.mkdir(config.tempDir, { recursive: true }),
  ]);
}
