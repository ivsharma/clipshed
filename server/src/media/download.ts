import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { JobProgress, JobStage, Settings, VideoQuality } from "@clipshed/shared";
import { config } from "../config";
import { AppError, mapYtDlpError } from "../errors";
import { LineSplitter, killProcessTree, runCommand } from "../lib/process";
import { assertBinaries } from "../services/binaries";
import { downloadArgs, outputTemplateFor, type DownloadPlan } from "./args";
import { ProgressTracker } from "./progress";

export interface DownloadTask extends DownloadPlan {
  id: string;
  /** File name without extension. */
  base: string;
  quality: VideoQuality | null;
}

export interface DownloadedFile {
  filename: string;
  size: number;
  duration: number | null;
  mime: string;
}

export type DownloadResult =
  | { cancelled: true }
  | { cancelled: false; video: DownloadedFile; audio: DownloadedFile | null };

export interface DownloadHandle {
  promise: Promise<DownloadResult>;
  cancel: () => Promise<void>;
}

interface Callbacks {
  onProgress: (progress: JobProgress) => void;
  onStage: (stage: JobStage) => void;
}

/** Thrown internally once the user cancels, so every step can stop the same way. */
class Cancelled extends Error {}

const MP3_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_TAIL = 8000;

const keepTail = (text: string, line: string): string => `${text}${line}\n`.slice(-MAX_TAIL);

async function removeDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

/** yt-dlp writes a single file per run; pick the largest match and skip partials. */
async function newestFile(dir: string, ext: string): Promise<string | null> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const candidates = entries.filter(
    (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(`.${ext}`) && !entry.name.endsWith(".part"),
  );

  const sized = await Promise.all(
    candidates.map(async (entry) => {
      const full = path.join(dir, entry.name);
      return { full, size: (await fs.stat(full)).size };
    }),
  );
  return sized.sort((a, b) => b.size - a.size)[0]?.full ?? null;
}

async function moveFile(source: string, destination: string): Promise<void> {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try {
    await fs.rename(source, destination);
  } catch (error) {
    // rename can't cross drives; fall back to copy + delete.
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    await fs.copyFile(source, destination);
    await fs.unlink(source);
  }
}

const DURATION_PATTERN = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/;

/**
 * Reads a finished file's duration from ffmpeg's input banner. ffmpeg prints the
 * stream summary to stderr and exits with an error because no output was given,
 * so only the parsed value matters.
 */
async function readDuration(file: string): Promise<number | null> {
  const probe = await runCommand(config.ffmpegPath, ["-hide_banner", "-i", file], {
    timeoutMs: 30_000,
  }).catch(() => null);

  const match = probe ? DURATION_PATTERN.exec(probe.stderr) : null;
  if (!match) return null;
  const [, hours, minutes, seconds] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

async function describeFile(
  file: string,
  filename: string,
  mime: string,
  duration?: number | null,
): Promise<DownloadedFile> {
  const stat = await fs.stat(file);
  return { filename, size: stat.size, duration: duration ?? (await readDuration(file)), mime };
}

/** Converts a downloaded video to MP3, used by "Both" so the range is fetched only once. */
function extractMp3(
  input: string,
  output: string,
  bitrate: number,
  onSpawn: (child: ChildProcess) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      config.ffmpegPath,
      ["-y", "-i", input, "-vn", "-map_metadata", "0", "-c:a", "libmp3lame", "-b:a", `${bitrate}k`, "-ac", "2", "-id3v2_version", "3", "-nostats", output],
      { windowsHide: true, stdio: ["ignore", "ignore", "pipe"], detached: process.platform !== "win32" },
    );
    onSpawn(ffmpeg);

    let stderr = "";
    let timedOut = false;
    ffmpeg.stderr?.setEncoding("utf8").on("data", (chunk: string) => (stderr = keepTail(stderr, chunk)));

    const timer = setTimeout(() => {
      timedOut = true;
      void killProcessTree(ffmpeg);
    }, MP3_TIMEOUT_MS);

    ffmpeg.once("error", (error) => {
      clearTimeout(timer);
      reject(new AppError("MP3_CONVERSION_FAILED", "Could not start ffmpeg for MP3 conversion.", 500, error.message));
    });
    ffmpeg.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else if (timedOut) reject(new AppError("MP3_TIMEOUT", "MP3 conversion took too long and was stopped.", 500));
      else reject(mapYtDlpError(stderr, "The MP4 downloaded, but MP3 conversion failed."));
    });
  });
}

/** Starts a yt-dlp download for the task. Progress is reported through callbacks. */
export async function startDownload(
  task: DownloadTask,
  settings: Settings,
  sectionSeconds: number | null,
  callbacks: Callbacks,
): Promise<DownloadHandle> {
  await assertBinaries();

  const tempDir = path.join(config.tempDir, task.id);
  await fs.mkdir(tempDir, { recursive: true });

  const args = downloadArgs(task, task.quality, settings, outputTemplateFor(tempDir, task.base));
  const tracker = new ProgressTracker(sectionSeconds, callbacks.onProgress, callbacks.onStage);

  const child = spawn(config.ytdlpPath, args, {
    cwd: config.rootDir,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });

  let activeChild: ChildProcess = child;
  let cancelled = false;
  let finished = false;
  let stdoutTail = "";
  let stderrTail = "";

  const stdout = new LineSplitter((line) => {
    stdoutTail = keepTail(stdoutTail, line);
    tracker.onStdoutLine(line);
  });
  const stderr = new LineSplitter((line) => {
    stderrTail = keepTail(stderrTail, line);
    tracker.onStderrLine(line);
  });
  child.stdout?.setEncoding("utf8").on("data", (chunk: string) => stdout.push(chunk));
  child.stderr?.setEncoding("utf8").on("data", (chunk: string) => stderr.push(chunk));

  const finalize = async (): Promise<DownloadResult> => {
    const outDir = path.join(config.downloadsDir, task.id);
    const isMp3 = task.kind === "mp3";
    const videoExt = isMp3 ? "mp3" : "mp4";
    const source = await newestFile(tempDir, videoExt);
    if (!source) {
      throw new AppError("OUTPUT_MISSING", "The download finished, but no output file was found.", 500, stderrTail.slice(-2000));
    }

    const videoName = `${task.base}.${videoExt}`;
    const videoPath = path.join(outDir, videoName);
    const mp3Name = `${task.base}.mp3`;

    if (task.kind === "both") {
      tracker.setStage("converting");
      tracker.indeterminate("Extracting MP3 from the downloaded section");
      const mp3Temp = path.join(tempDir, mp3Name);
      await extractMp3(source, mp3Temp, task.bitrate ?? 192, (ffmpeg) => (activeChild = ffmpeg));
      activeChild = child;
      if (cancelled) throw new Cancelled();

      await moveFile(mp3Temp, path.join(outDir, mp3Name));
    }

    if (cancelled) throw new Cancelled();
    await moveFile(source, videoPath);
    const video = await describeFile(videoPath, videoName, isMp3 ? "audio/mpeg" : "video/mp4");

    // The MP3 is extracted from the MP4, so both files share one duration read.
    const audio =
      task.kind === "both"
        ? await describeFile(path.join(outDir, mp3Name), mp3Name, "audio/mpeg", video.duration)
        : null;

    await removeDir(tempDir);
    return { cancelled: false, video, audio };
  };

  const promise = new Promise<DownloadResult>((resolve, reject) => {
    const settle = (action: () => void): void => {
      finished = true;
      action();
    };

    child.once("error", (error) => {
      void removeDir(tempDir).then(() =>
        settle(() =>
          reject(new AppError("SPAWN_FAILED", "Could not start yt-dlp. Check that the binary exists.", 500, error.message)),
        ),
      );
    });

    child.once("close", (code) => {
      stdout.flush();
      stderr.flush();

      if (cancelled) {
        void removeDir(tempDir).then(() => settle(() => resolve({ cancelled: true })));
        return;
      }
      if (code !== 0) {
        void removeDir(tempDir).then(() =>
          settle(() => reject(mapYtDlpError(`${stderrTail}\n${stdoutTail}`, "The download failed. Try again or check the diagnostics."))),
        );
        return;
      }

      tracker.setStage("finalizing");
      tracker.complete("Finalizing");

      finalize().then(
        (result) => settle(() => resolve(result)),
        (error: unknown) => {
          if (error instanceof Cancelled || cancelled) {
            void removeDir(tempDir).then(() => settle(() => resolve({ cancelled: true })));
            return;
          }
          void removeDir(tempDir).then(() => settle(() => reject(error)));
        },
      );
    });
  });

  return {
    promise,
    cancel: async () => {
      if (cancelled || finished) return;
      cancelled = true;
      tracker.setStage("cancelling");
      tracker.freeze();
      await killProcessTree(activeChild);
    },
  };
}
