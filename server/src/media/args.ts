import path from "node:path";
import {
  formatSectionTimestamp,
  type JobKind,
  type JobRange,
  type Settings,
  type VideoQuality,
} from "@clipshed/shared";
import { config } from "../config";
import { AppError } from "../errors";
import { resolveCookiesFile } from "../services/settings";
import { formatSelector } from "./formats";

const PROGRESS_TEMPLATE =
  "download:PROGRESS|%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s|%(info.format_id)s|%(info.vcodec)s|%(info.acodec)s";

const POSTPROCESS_TEMPLATE = "postprocess:POSTPROCESS|%(progress.status)s|%(progress.postprocessor)s";

export interface DownloadPlan {
  url: string;
  kind: JobKind;
  bitrate: number | null;
  range: JobRange | null;
  precise: boolean;
}

function cookieArgs(settings: Settings): string[] {
  if (settings.cookiesMode === "browser") {
    return ["--cookies-from-browser", settings.cookiesBrowser];
  }

  if (settings.cookiesMode === "file") {
    const file = resolveCookiesFile(settings);
    if (!file) {
      throw new AppError("COOKIES_FILE_MISSING", "Choose a cookies.txt file in Settings first.");
    }
    return ["--cookies", file];
  }

  return [];
}

function commonArgs(settings: Settings): string[] {
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

export function probeArgs(url: string, settings: Settings): string[] {
  return [
    "--dump-single-json",
    "--skip-download",
    "--no-warnings",
    "--no-progress",
    "--retries",
    "5",
    "--extractor-retries",
    "3",
    ...commonArgs(settings),
    url,
  ];
}

/**
 * Builds the yt-dlp command for a download. `quality` is required for MP4 and
 * Both; MP3 uses audio only.
 */
export function downloadArgs(
  plan: DownloadPlan,
  quality: VideoQuality | null,
  settings: Settings,
  outputTemplate: string,
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
    PROGRESS_TEMPLATE,
    "--progress-template",
    POSTPROCESS_TEMPLATE,
    ...commonArgs(settings),
  ];

  if (plan.kind === "mp3") {
    args.push("-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", `${plan.bitrate ?? 192}K`);
  } else {
    if (!quality) throw new AppError("NO_VIDEO_FORMAT", "No video quality was selected.", 422);
    args.push("-f", formatSelector(quality, settings.preferH264), "--merge-output-format", "mp4");
  }

  if (plan.range) {
    const start = formatSectionTimestamp(plan.range.start);
    const end = formatSectionTimestamp(plan.range.end);
    args.push("--download-sections", `*${start}-${end}`);
  }

  if (plan.precise && plan.range && plan.kind !== "mp3") {
    args.push("--force-keyframes-at-cuts");
  }

  args.push("-o", outputTemplate, plan.url);
  return args;
}

export function outputTemplateFor(tempDir: string, base: string): string {
  return path.join(tempDir, `${base.replace(/%/g, "%%")}.%(ext)s`);
}
