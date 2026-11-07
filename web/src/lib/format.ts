import {
  formatClock,
  formatDuration,
  type Job,
  type JobKind,
  type ProbeResult,
} from "@clipshed/shared";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatDate(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function rangeText(job: Job): string {
  if (!job.range) return "Full video";
  return `${formatClock(job.range.start)} – ${formatClock(job.range.end)}`;
}

export function stageLabel(job: Job): string {
  switch (job.stage) {
    case "queued":
      return "Queued";
    case "resolving":
      return "Reading video";
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
    case "done":
      return "Done";
    default:
      return "Working";
  }
}

export function statusLabel(job: Job): string {
  switch (job.status) {
    case "queued":
      return "Queued";
    case "resolving":
      return "Reading";
    case "running":
      return stageLabel(job);
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return job.status;
  }
}

export function kindLabel(kind: JobKind): string {
  if (kind === "both") return "MP4 + MP3";
  return kind === "mp4" ? "MP4" : "MP3";
}

export interface SizeEstimates {
  video: number | null;
  audio: number | null;
  total: number | null;
}

export function estimateSizes(
  video: ProbeResult,
  kind: JobKind,
  height: number | null,
  bitrate: number | null,
  start: number,
  end: number,
  fullVideo: boolean,
): SizeEstimates {
  const duration = video.duration;
  const selected = duration
    ? fullVideo
      ? duration
      : clamp(end - start, 0, duration)
    : null;

  let videoSize: number | null = null;
  let audioSize: number | null = null;

  if (kind !== "mp3") {
    const quality =
      video.qualities.find((entry) => entry.height === height) ??
      video.qualities.find((entry) => entry.height <= (height ?? 1080)) ??
      video.qualities[0];

    if (quality?.approxSize) {
      videoSize =
        duration && selected !== null
          ? Math.round(quality.approxSize * (selected / duration))
          : quality.approxSize;
    }
  }

  if (kind !== "mp4" && selected !== null) {
    audioSize = Math.round(((bitrate ?? 192) * 1000 * selected) / 8);
  }

  const total =
    kind === "mp4"
      ? videoSize
      : kind === "mp3"
        ? audioSize
        : videoSize !== null || audioSize !== null
          ? (videoSize ?? 0) + (audioSize ?? 0)
          : null;

  return { video: videoSize, audio: audioSize, total };
}

export function selectedDurationLabel(
  video: ProbeResult,
  start: number,
  end: number,
  fullVideo: boolean,
): string {
  if (fullVideo || !video.duration) {
    return video.duration ? formatDuration(video.duration) : "Unknown length";
  }
  return formatDuration(Math.max(0, end - start));
}
