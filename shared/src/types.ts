import type { PlatformId } from "./platforms";

export type OutputKind = "mp4" | "mp3";
export type JobKind = OutputKind | "both";

export type JobStatus = "queued" | "resolving" | "running" | "completed" | "failed" | "cancelled";

export type JobStage =
  | "queued"
  | "resolving"
  | "downloading_video"
  | "downloading_audio"
  | "downloading"
  | "merging"
  | "converting"
  | "finalizing"
  | "cancelling"
  | "done";

export interface VideoQuality {
  height: number;
  label: string;
  fps: number;
  h264: boolean;
  codecs: string[];
  /** Estimated size in bytes for the whole video, including audio. */
  approxSize: number | null;
}

export interface Chapter {
  start: number;
  end: number;
  title: string;
}

export interface ProbeResult {
  platform: PlatformId;
  mediaId: string;
  url: string;
  title: string;
  uploader: string | null;
  duration: number | null;
  thumbnail: string | null;
  qualities: VideoQuality[];
  chapters: Chapter[];
  isLive: boolean;
  liveStatus: string | null;
  ageLimit: number | null;
  availability: string | null;
  /** Start time parsed from the pasted link, e.g. `?t=90`. */
  suggestedStart: number | null;
}

export interface JobRange {
  start: number;
  end: number;
}

export interface JobProgress {
  percent: number | null;
  downloadedBytes: number;
  totalBytes: number | null;
  speed: number | null;
  eta: number | null;
  detail: string | null;
}

export interface JobOutput {
  filename: string;
  size: number;
  duration: number | null;
  mime: string;
  downloadUrl: string;
}

export interface JobError {
  code: string;
  message: string;
  details?: string;
}

export interface Job {
  id: string;
  url: string;
  platform: PlatformId;
  mediaId: string;
  title: string;
  uploader: string | null;
  thumbnail: string | null;
  duration: number | null;
  kind: JobKind;
  height: number | null;
  bitrate: number | null;
  range: JobRange | null;
  precise: boolean;
  status: JobStatus;
  stage: JobStage;
  progress: JobProgress;
  output: JobOutput | null;
  /** Present when kind is "both": the MP3 produced from the same download. */
  audioOutput: JobOutput | null;
  error: JobError | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export type CookiesMode = "none" | "file" | "browser";

export type CookiesBrowser =
  | "chrome"
  | "edge"
  | "firefox"
  | "brave"
  | "chromium"
  | "opera"
  | "vivaldi";

export interface Settings {
  cookiesMode: CookiesMode;
  cookiesBrowser: CookiesBrowser;
  cookiesFile: string;
  preferH264: boolean;
}

export interface Health {
  ok: boolean;
  appVersion: string;
  ytdlpVersion: string | null;
  ffmpegVersion: string | null;
  nodeVersion: string;
  binariesOk: boolean;
  cookiesConfigured: boolean;
}

export interface ReleaseInfo {
  /** Version without the leading `v` or build metadata. */
  version: string;
  tag: string;
  name: string;
  url: string;
  publishedAt: string | null;
  prerelease: boolean;
}

export interface UpdateCheck {
  currentVersion: string;
  latest: ReleaseInfo | null;
  updateAvailable: boolean;
  /** ISO timestamp of when GitHub was queried. */
  checkedAt: string;
}

export interface SettingsPayload {
  settings: Settings;
  health: Health;
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    details?: string;
  };
}

export interface JobEvent {
  type: "snapshot" | "update" | "done" | "error";
  job: Job;
}
