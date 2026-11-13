import { formatClock, type Job, type JobKind } from "@clipshed/shared";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function kindLabel(kind: JobKind): string {
  if (kind === "both") return "MP4 + MP3";
  return kind === "mp4" ? "MP4" : "MP3";
}

const STAGE_LABELS: Record<Job["stage"], string> = {
  queued: "Queued",
  resolving: "Reading video",
  downloading_video: "Downloading video",
  downloading_audio: "Downloading audio",
  downloading: "Downloading",
  merging: "Merging audio and video",
  converting: "Converting to MP3",
  finalizing: "Finalizing",
  cancelling: "Cancelling",
  done: "Done",
};

export function stageLabel(job: Job): string {
  return STAGE_LABELS[job.stage] ?? "Working";
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
  }
}

export function rangeText(job: Job): string {
  if (!job.range) return "Full video";
  return `${formatClock(job.range.start)} – ${formatClock(job.range.end)}`;
}
