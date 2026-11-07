import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  formatSectionTimestamp,
  type Chapter,
  type JobKind,
  type JobProgress,
  type JobRange,
  type JobStage,
  type ProbeResult,
  type Settings,
  type VideoQuality,
} from "@clipshed/shared";
import { config } from "../config";
import { LineSplitter } from "../lib/line-splitter";
import { killProcessTree, runCommand } from "../lib/process";
import { assertBinaries } from "./binaries";
import { AppError, mapYtDlpError, stripAnsi } from "./errors";
import { resolveCookiesFile } from "./settings";

const DOWNLOAD_TEMPLATE =
  "download:PROGRESS|%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s|%(info.format_id)s|%(info.vcodec)s|%(info.acodec)s";

const POSTPROCESS_TEMPLATE =
  "postprocess:POSTPROCESS|%(progress.status)s|%(progress.postprocessor)s";

export interface DownloadTask {
  id: string;
  url: string;
  kind: JobKind;
  height: number | null;
  bitrate: number | null;
  range: JobRange | null;
  precise: boolean;
}

export interface DownloadCallbacks {
  onProgress: (progress: JobProgress) => void;
  onStage: (stage: JobStage) => void;
}

export interface DownloadResult {
  cancelled: boolean;
  filePath?: string;
  filename?: string;
  size?: number;
  duration?: number | null;
  mime?: string;
  audio?: {
    filename: string;
    size: number;
    duration: number | null;
    mime: string;
  };
}

export interface DownloadHandle {
  promise: Promise<DownloadResult>;
  cancel: () => Promise<void>;
}

type RawRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RawRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && value !== "NA") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function numericText(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "NA" || trimmed === "None" || trimmed === "null") {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function cookieArgs(settings: Settings): string[] {
  if (settings.cookiesMode === "browser") {
    return ["--cookies-from-browser", settings.cookiesBrowser];
  }

  if (settings.cookiesMode === "file") {
    const file = resolveCookiesFile(settings);
    if (!file) {
      throw new AppError(
        "COOKIES_FILE_MISSING",
        "Choose a cookies.txt file in Settings first.",
      );
    }
    if (!existsSync(file)) {
      throw new AppError(
        "COOKIES_FILE_MISSING",
        `Cookies file not found at ${file}.`,
      );
    }
    return ["--cookies", file];
  }

  return [];
}

function sharedArgs(settings: Settings): string[] {
  return [
    "--no-playlist",
    "--color",
    "never",
    "--js-runtimes",
    "node",
    "--ffmpeg-location",
    config.ffmpegDir,
    "--socket-timeout",
    "30",
    ...cookieArgs(settings),
  ];
}

function codecLabel(vcodec: string): string {
  const codec = vcodec.toLowerCase();
  if (codec.startsWith("avc1") || codec.startsWith("h264")) return "H.264";
  if (codec.startsWith("vp09") || codec.startsWith("vp9")) return "VP9";
  if (codec.startsWith("av01")) return "AV1";
  if (codec.startsWith("hev1") || codec.startsWith("hvc1")) return "HEVC";
  return codec.split(".")[0]?.toUpperCase() || codec.toUpperCase();
}

function estimateSizeFromTbr(
  tbrKbps: number | null,
  durationSeconds: number | null,
): number | null {
  if (!tbrKbps || !durationSeconds) return null;
  return Math.round((tbrKbps * 1000 * durationSeconds) / 8);
}

function buildQualities(
  info: RawRecord,
  duration: number | null,
): VideoQuality[] {
  const formats = asArray(info.formats).filter(isRecord);

  const audioFormats = formats.filter((format) => {
    const vcodec = asString(format.vcodec);
    const acodec = asString(format.acodec);
    return (!vcodec || vcodec === "none") && Boolean(acodec && acodec !== "none");
  });

  const bestAudio = [...audioFormats].sort(
    (a, b) => (asNumber(b.tbr) ?? 0) - (asNumber(a.tbr) ?? 0),
  )[0];

  const audioSize = bestAudio
    ? (asNumber(bestAudio.filesize) ??
      asNumber(bestAudio.filesize_approx) ??
      estimateSizeFromTbr(asNumber(bestAudio.tbr), duration))
    : null;

  const groups = new Map<number, RawRecord[]>();

  for (const format of formats) {
    const height = asNumber(format.height);
    const vcodec = asString(format.vcodec);
    const ext = asString(format.ext);
    const note = (asString(format.format_note) ?? "").toLowerCase();

    if (!height || height <= 0) continue;
    if (!vcodec || vcodec === "none" || vcodec === "images") continue;
    if (ext === "mhtml" || note.includes("storyboard")) continue;

    const group = groups.get(height) ?? [];
    group.push(format);
    groups.set(height, group);
  }

  const qualities: VideoQuality[] = [];

  for (const [height, group] of groups) {
    const fps = Math.max(...group.map((format) => asNumber(format.fps) ?? 0));
    const codecs = [
      ...new Set(
        group
          .map((format) => asString(format.vcodec))
          .filter((value): value is string => Boolean(value))
          .map(codecLabel),
      ),
    ];
    const h264 = group.some((format) => {
      const codec = (asString(format.vcodec) ?? "").toLowerCase();
      return codec.startsWith("avc1") || codec.startsWith("h264");
    });

    // Prefer direct HTTP(S) formats for the size estimate. YouTube also lists
    // HLS variants with much higher tbr values that yt-dlp doesn't normally
    // select for a section download, which would make the estimate look huge.
    const directFormats = group.filter((format) => {
      const protocol = (asString(format.protocol) ?? "").toLowerCase();
      return protocol === "https" || protocol === "http";
    });
    const estimatePool = directFormats.length > 0 ? directFormats : group;

    const best = [...estimatePool].sort(
      (a, b) => (asNumber(b.tbr) ?? 0) - (asNumber(a.tbr) ?? 0),
    )[0];

    const videoSize = best
      ? (asNumber(best.filesize) ??
        asNumber(best.filesize_approx) ??
        estimateSizeFromTbr(asNumber(best.tbr), duration))
      : null;

    const approxSize =
      videoSize === null ? null : videoSize + (audioSize ?? 0);

    qualities.push({
      height,
      label: `${height}p${fps >= 50 ? "60" : ""}`,
      fps,
      h264,
      codecs,
      approxSize,
    });
  }

  return qualities.sort((a, b) => b.height - a.height);
}

function normalizeInfo(
  info: RawRecord,
  url: string,
  videoId: string,
): ProbeResult {
  const duration = asNumber(info.duration);
  const thumbnails = asArray(info.thumbnails).filter(isRecord);
  const bestThumbnail = [...thumbnails].sort(
    (a, b) => (asNumber(b.width) ?? 0) - (asNumber(a.width) ?? 0),
  )[0];

  const chapters: Chapter[] = asArray(info.chapters)
    .filter(isRecord)
    .map((chapter, index) => ({
      start: asNumber(chapter.start_time) ?? 0,
      end: asNumber(chapter.end_time) ?? 0,
      title: asString(chapter.title) ?? `Chapter ${index + 1}`,
    }))
    .filter((chapter) => chapter.end > chapter.start)
    .sort((a, b) => a.start - b.start);

  const liveStatus = asString(info.live_status);

  return {
    videoId,
    url,
    title: asString(info.title) ?? "Untitled video",
    uploader: asString(info.uploader) ?? asString(info.channel),
    duration: duration && duration > 0 ? duration : null,
    thumbnail: asString(info.thumbnail) ?? asString(bestThumbnail?.url),
    qualities: buildQualities(info, duration),
    chapters,
    isLive: info.is_live === true || liveStatus === "is_live",
    liveStatus,
    ageLimit: asNumber(info.age_limit),
    availability: asString(info.availability),
    suggestedStart: null,
  };
}

export async function probeVideo(
  url: string,
  videoId: string,
  settings: Settings,
): Promise<ProbeResult> {
  await assertBinaries();

  const args = [
    "--dump-single-json",
    "--skip-download",
    "--no-warnings",
    "--no-progress",
    "--retries",
    "5",
    "--extractor-retries",
    "3",
    ...sharedArgs(settings),
    url,
  ];

  const result = await runCommand(config.ytdlpPath, args, {
    cwd: config.rootDir,
    timeoutMs: 120_000,
  });

  if (result.timedOut) {
    throw new AppError(
      "PROBE_TIMEOUT",
      "YouTube took too long to respond. Try again.",
      504,
      stripAnsi(result.stderr).slice(-2000),
    );
  }

  if (result.code !== 0) {
    throw mapYtDlpError(result.stderr, "Could not read this video.");
  }

  let info: unknown;
  try {
    const text = result.stdout.trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    info = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
  } catch {
    throw new AppError(
      "PROBE_PARSE",
      "The video information came back in an unexpected format. Try again.",
      502,
    );
  }

  if (!isRecord(info)) {
    throw new AppError("PROBE_PARSE", "Could not read the video information.", 502);
  }

  if (info._type === "playlist" || Array.isArray(info.entries)) {
    throw new AppError(
      "PLAYLIST_UNSUPPORTED",
      "Playlists aren't supported yet. Paste a link to a single video.",
    );
  }

  return normalizeInfo(info, url, videoId);
}

function pickQuality(
  probe: ProbeResult,
  requestedHeight: number | null,
): VideoQuality {
  if (probe.qualities.length === 0) {
    throw new AppError(
      "NO_VIDEO_FORMAT",
      "This video doesn't have a downloadable video stream. Try MP3 instead.",
      422,
    );
  }

  const requested =
    requestedHeight ??
    (probe.qualities.find((quality) => quality.height <= 1080)?.height ??
      probe.qualities[0].height);

  const atOrBelow = probe.qualities.filter(
    (quality) => quality.height <= requested,
  );

  return atOrBelow[0] ?? probe.qualities[probe.qualities.length - 1];
}

function buildFormatSelector(
  quality: VideoQuality,
  preferH264: boolean,
): string {
  const height = quality.height;

  if (preferH264 && quality.h264) {
    return `bv*[height<=${height}][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=${height}]+ba/b[height<=${height}]`;
  }

  return `bv*[height<=${height}]+ba/b[height<=${height}]`;
}

function buildDownloadArgs(
  job: DownloadTask,
  probe: ProbeResult,
  settings: Settings,
  tempDir: string,
  base: string,
): string[] {
  const args = [
    "--newline",
    "--no-warnings",
    "--retries",
    "10",
    "--fragment-retries",
    "10",
    "--extractor-retries",
    "3",
    "--concurrent-fragments",
    "4",
    "--no-mtime",
    "--embed-metadata",
    "--progress-delta",
    "0.2",
    "--downloader-args",
    "ffmpeg:-progress pipe:2 -nostats",
    "--progress-template",
    DOWNLOAD_TEMPLATE,
    "--progress-template",
    POSTPROCESS_TEMPLATE,
    ...sharedArgs(settings),
  ];

  if (job.kind !== "mp3") {
    const quality = pickQuality(probe, job.height);
    args.push(
      "-f",
      buildFormatSelector(quality, settings.preferH264),
      "--merge-output-format",
      "mp4",
    );
  } else {
    args.push(
      "-f",
      "ba/b",
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      `${job.bitrate ?? 192}K`,
    );
  }

  if (job.range) {
    args.push(
      "--download-sections",
      `*${formatSectionTimestamp(job.range.start)}-${formatSectionTimestamp(job.range.end)}`,
    );
  }

  if (job.precise && job.range && job.kind === "mp4") {
    args.push("--force-keyframes-at-cuts");
  }

  const escapedBase = base.replace(/%/g, "%%");
  args.push(
    "-o",
    path.join(tempDir, `${escapedBase}.%(ext)s`),
    job.url,
  );

  return args;
}

async function findOutputFile(
  directory: string,
  base: string,
  ext: string,
): Promise<string | null> {
  const expected = path.join(directory, `${base}.${ext}`);

  try {
    const stat = await fs.stat(expected);
    if (stat.isFile()) return expected;
  } catch {
    // fall through to a directory scan
  }

  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates: { path: string; size: number }[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(`.${ext}`)) continue;
    if (entry.name.endsWith(".part") || entry.name.endsWith(".ytdl")) continue;

    const filePath = path.join(directory, entry.name);
    try {
      const stat = await fs.stat(filePath);
      candidates.push({ path: filePath, size: stat.size });
    } catch {
      // ignore
    }
  }

  candidates.sort((a, b) => b.size - a.size);
  return candidates[0]?.path ?? null;
}

async function moveFile(source: string, destination: string): Promise<void> {
  await fs.mkdir(path.dirname(destination), { recursive: true });

  try {
    await fs.rename(source, destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EXDEV") {
      await fs.copyFile(source, destination);
      await fs.unlink(source);
      return;
    }
    throw error;
  }
}

async function ffprobeFile(
  filePath: string,
): Promise<{ duration: number | null; size: number | null } | null> {
  try {
    const result = await runCommand(
      config.ffprobePath,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration,size",
        "-of",
        "json",
        filePath,
      ],
      { timeoutMs: 30_000 },
    );

    if (result.code !== 0) return null;

    const parsed = JSON.parse(result.stdout) as {
      format?: { duration?: string; size?: string };
    };

    return {
      duration: asNumber(parsed.format?.duration),
      size: asNumber(parsed.format?.size),
    };
  } catch {
    return null;
  }
}

function stageLabel(stage: JobStage): string {
  switch (stage) {
    case "downloading_video":
      return "Downloading video";
    case "downloading_audio":
      return "Downloading audio";
    case "downloading":
      return "Downloading";
    case "merging":
      return "Merging audio and video";
    case "converting":
      return "Converting to MP3";
    case "finalizing":
      return "Finalizing";
    case "cancelling":
      return "Cancelling";
    case "resolving":
      return "Reading video";
    case "queued":
      return "Queued";
    case "done":
      return "Done";
    default:
      return "Working";
  }
}

export async function startDownload(
  job: DownloadTask,
  probe: ProbeResult,
  settings: Settings,
  tempDir: string,
  base: string,
  callbacks: DownloadCallbacks,
): Promise<DownloadHandle> {
  await assertBinaries();
  await fs.mkdir(tempDir, { recursive: true });

  const args = buildDownloadArgs(job, probe, settings, tempDir, base);
  const ext = job.kind === "mp3" ? "mp3" : "mp4";

  const child = spawn(config.ytdlpPath, args, {
    cwd: config.rootDir,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });

  let activeChild: ChildProcess = child;
  let stage: JobStage = "downloading";
  let cancelled = false;
  let settled = false;
  let stderrTail = "";
  let stdoutTail = "";
  let ffmpegMode = false;
  let ffmpegContentSeconds = 0;
  let ffmpegSpeedFactor: number | null = null;
  let lastSize = 0;
  let lastSizeAt = Date.now();
  let lastEmit = 0;

  const progress: JobProgress = {
    percent: 0,
    downloadedBytes: 0,
    totalBytes: null,
    speed: null,
    eta: null,
    detail: "Starting…",
  };

  const safeOnProgress = (value: JobProgress): void => {
    try {
      callbacks.onProgress(value);
    } catch {
      // A broken listener should not abort a download.
    }
  };

  const safeOnStage = (value: JobStage): void => {
    try {
      callbacks.onStage(value);
    } catch {
      // A broken listener should not abort a download.
    }
  };

  const emit = (force = false): void => {
    const now = Date.now();
    if (!force && now - lastEmit < 250) return;
    lastEmit = now;
    safeOnProgress({ ...progress });
  };

  const updateStage = (next: JobStage): void => {
    if (cancelled || stage === next) return;
    stage = next;
    progress.detail = stageLabel(next);
    safeOnStage(next);
    emit(true);
  };

  const sectionDuration = job.range
    ? Math.max(1, job.range.end - job.range.start)
    : probe.duration;

  const estimatedEta = (): number | null => {
    if (!ffmpegSpeedFactor || !sectionDuration) return null;
    const remaining = Math.max(0, sectionDuration - ffmpegContentSeconds);
    return remaining / ffmpegSpeedFactor;
  };

  const handleStdout = (rawLine: string): void => {
    const line = stripAnsi(rawLine).trim();
    if (!line) return;

    stdoutTail = `${stdoutTail}${line}\n`.slice(-8000);

    if (line.startsWith("PROGRESS|")) {
      const parts = line.split("|");
      const status = parts[1];
      const downloaded = numericText(parts[2]) ?? 0;
      const total = numericText(parts[3]) ?? numericText(parts[4]);
      const speed = numericText(parts[5]);
      const eta = numericText(parts[6]);
      const formatId = parts[7] ?? null;
      const vcodec = parts[8] ?? null;
      const acodec = parts[9] ?? null;

      progress.downloadedBytes = downloaded;
      progress.totalBytes = total;
      progress.speed = speed ?? progress.speed;
      progress.eta = eta ?? progress.eta;

      if (!ffmpegMode && total && total > 0) {
        progress.percent = Math.min(100, (downloaded / total) * 100);
      }

      if (status === "finished") {
        progress.eta = 0;
        if (!ffmpegMode) progress.percent = 100;
      }

      if (!ffmpegMode) {
        const isVideo = Boolean(vcodec && vcodec !== "none");
        const isAudio = Boolean(acodec && acodec !== "none");

        if (isVideo && !isAudio) updateStage("downloading_video");
        else if (isAudio && !isVideo) updateStage("downloading_audio");
        else updateStage("downloading");
      }

      const label = stageLabel(stage);
      progress.detail = formatId ? `${label} · ${formatId}` : label;
      emit();
      return;
    }

    if (line.startsWith("POSTPROCESS|")) {
      const parts = line.split("|");
      const status = parts[1];
      const processor = parts[2] ?? "";

      if (status === "started") {
        if (processor.includes("ExtractAudio")) updateStage("converting");
        else if (processor.includes("Merger")) updateStage("merging");
        else if (processor.includes("MoveFiles")) updateStage("finalizing");
        else if (processor.includes("Fixup")) updateStage("finalizing");
      }
      return;
    }

    if (line.startsWith("[ExtractAudio]")) {
      updateStage("converting");
      return;
    }

    if (line.startsWith("[Merger]")) {
      updateStage("merging");
      return;
    }

    if (line.startsWith("[download] Destination:")) {
      emit();
    }
  };

  const handleStderr = (rawLine: string): void => {
    const line = stripAnsi(rawLine);
    if (!line) return;

    stderrTail = `${stderrTail}${line}\n`.slice(-12_000);

    const outTime = /^out_time_us=(\d+)/.exec(line);
    if (outTime) {
      ffmpegMode = true;
      ffmpegContentSeconds = Number(outTime[1]) / 1_000_000;

      if (sectionDuration && sectionDuration > 0) {
        progress.percent = Math.min(
          100,
          (ffmpegContentSeconds / sectionDuration) * 100,
        );
      }

      progress.eta = estimatedEta();
      progress.detail = ffmpegSpeedFactor
        ? `Downloading selected range · ${ffmpegSpeedFactor.toFixed(1)}× realtime`
        : "Downloading selected range";
      emit();
      return;
    }

    const size = /^(?:total_)?size=\s*(\d+)\s*(KiB)?/.exec(line);
    if (size) {
      const bytes = Number(size[1]) * (size[2] ? 1024 : 1);
      const now = Date.now();
      const elapsed = (now - lastSizeAt) / 1000;

      if (elapsed > 0 && bytes >= lastSize) {
        const rate = (bytes - lastSize) / elapsed;
        if (Number.isFinite(rate) && rate > 0) progress.speed = rate;
      }

      lastSize = bytes;
      lastSizeAt = now;
      progress.downloadedBytes = bytes;
      emit();
      return;
    }

    const speed = /^speed=\s*([\d.]+)x/.exec(line);
    if (speed) {
      ffmpegSpeedFactor = Number(speed[1]);
      progress.eta = estimatedEta();
      progress.detail = Number.isFinite(ffmpegSpeedFactor)
        ? `Downloading selected range · ${ffmpegSpeedFactor.toFixed(1)}× realtime`
        : "Downloading selected range";
      emit();
      return;
    }

    if (line.startsWith("progress=end")) {
      progress.percent = 100;
      progress.eta = 0;
      emit(true);
    }
  };

  const stdoutSplitter = new LineSplitter(handleStdout);
  const stderrSplitter = new LineSplitter(handleStderr);

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => stdoutSplitter.push(chunk));
  child.stderr?.on("data", (chunk: string) => stderrSplitter.push(chunk));

  const cleanupTemp = async (): Promise<void> => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  };

  const convertToMp3 = (
    input: string,
    output: string,
  ): Promise<void> => {
    updateStage("converting");
    progress.percent = null;
    progress.speed = null;
    progress.eta = null;
    progress.detail = "Extracting MP3 from the downloaded section";
    emit(true);

    return new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn(
        config.ffmpegPath,
        [
          "-y",
          "-i",
          input,
          "-vn",
          "-map_metadata",
          "0",
          "-c:a",
          "libmp3lame",
          "-b:a",
          `${job.bitrate ?? 192}k`,
          "-ac",
          "2",
          "-id3v2_version",
          "3",
          "-progress",
          "pipe:2",
          "-nostats",
          output,
        ],
        {
          windowsHide: true,
          stdio: ["ignore", "ignore", "pipe"],
          detached: process.platform !== "win32",
        },
      );

      activeChild = ffmpeg;

      let finished = false;
      let timer: NodeJS.Timeout | null = null;
      let conversionStderr = "";

      const finish = (error?: unknown): void => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        activeChild = child;
        if (error) reject(error);
        else resolve();
      };

      timer = setTimeout(() => {
        void killProcessTree(ffmpeg);
        finish(
          new AppError(
            "MP3_TIMEOUT",
            "MP3 conversion took too long and was stopped.",
            500,
          ),
        );
      }, 10 * 60 * 1000);
      timer.unref?.();

      ffmpeg.stderr?.setEncoding("utf8");
      ffmpeg.stderr?.on("data", (chunk: string) => {
        conversionStderr = `${conversionStderr}${chunk}`.slice(-8000);
      });

      ffmpeg.once("error", (error) => {
        finish(
          new AppError(
            "MP3_CONVERSION_FAILED",
            "Could not start ffmpeg for MP3 conversion.",
            500,
            error.message,
          ),
        );
      });

      ffmpeg.once("close", (code) => {
        if (code === 0) {
          finish();
        } else {
          finish(
            mapYtDlpError(
              conversionStderr,
              "The MP4 downloaded, but MP3 conversion failed.",
            ),
          );
        }
      });
    });
  };

  const promise = new Promise<DownloadResult>((resolve, reject) => {
    const fail = async (error: unknown): Promise<void> => {
      if (settled) return;
      settled = true;
      await cleanupTemp();
      reject(error);
    };

    child.once("error", (error) => {
      void fail(
        new AppError(
          "SPAWN_FAILED",
          "Could not start yt-dlp. Check that the binary exists and is executable.",
          500,
          error.message,
        ),
      );
    });

    child.once("close", (code) => {
      stdoutSplitter.flush();
      stderrSplitter.flush();

      if (settled) return;

      if (cancelled) {
        settled = true;
        void cleanupTemp().then(() => resolve({ cancelled: true }));
        return;
      }

      if (code !== 0) {
        void fail(
          mapYtDlpError(
            `${stderrTail}\n${stdoutTail}`,
            "The download failed. Try again or check the diagnostics.",
          ),
        );
        return;
      }

      updateStage("finalizing");
      progress.percent = 100;
      progress.eta = 0;
      progress.detail = "Finalizing";
      emit(true);

      void (async () => {
        try {
          if (cancelled) {
            settled = true;
            await cleanupTemp();
            resolve({ cancelled: true });
            return;
          }

          const found = await findOutputFile(tempDir, base, ext);
          if (!found) {
            throw new AppError(
              "OUTPUT_MISSING",
              "The download finished, but no output file was found.",
              500,
              stderrTail.slice(-2000),
            );
          }

          const stat = await fs.stat(found);
          const meta = await ffprobeFile(found);
          const outDir = path.join(config.downloadsDir, job.id);
          const filename = `${base}.${ext}`;
          const finalPath = path.join(outDir, filename);
          let audio: DownloadResult["audio"] | undefined;

          if (job.kind === "both") {
            if (cancelled) {
              settled = true;
              await cleanupTemp();
              resolve({ cancelled: true });
              return;
            }

            const mp3Temp = path.join(tempDir, `${base}.mp3`);
            await convertToMp3(found, mp3Temp);

            if (cancelled) {
              settled = true;
              await cleanupTemp();
              resolve({ cancelled: true });
              return;
            }

            const mp3Stat = await fs.stat(mp3Temp);
            const mp3Meta = await ffprobeFile(mp3Temp);
            const audioFilename = `${base}.mp3`;
            const audioFinalPath = path.join(outDir, audioFilename);

            await moveFile(found, finalPath);
            await moveFile(mp3Temp, audioFinalPath);

            audio = {
              filename: audioFilename,
              size: mp3Meta?.size ?? mp3Stat.size,
              duration: mp3Meta?.duration ?? null,
              mime: "audio/mpeg",
            };
          } else {
            await moveFile(found, finalPath);
          }

          if (cancelled) {
            settled = true;
            await cleanupTemp();
            resolve({ cancelled: true });
            return;
          }

          updateStage("finalizing");
          progress.percent = 100;
          progress.eta = 0;
          progress.detail = "Finalizing";
          emit(true);
          await cleanupTemp();

          settled = true;
          resolve({
            cancelled: false,
            filePath: finalPath,
            filename,
            size: meta?.size ?? stat.size,
            duration: meta?.duration ?? null,
            mime: job.kind === "mp3" ? "audio/mpeg" : "video/mp4",
            audio,
          });
        } catch (error) {
          if (cancelled) {
            settled = true;
            await cleanupTemp();
            resolve({ cancelled: true });
          } else {
            await fail(error);
          }
        }
      })();
    });
  });

  return {
    promise,
    cancel: async () => {
      if (settled || cancelled) return;
      cancelled = true;
      progress.detail = "Cancelling…";
      safeOnStage("cancelling");
      emit(true);
      await killProcessTree(activeChild);
    },
  };
}
