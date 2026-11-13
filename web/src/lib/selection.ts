import { formatDuration, type JobKind, type ProbeResult, type VideoQuality } from "@clipshed/shared";
import { clamp } from "./format";

export interface Selection {
  kind: JobKind;
  height: number | null;
  bitrate: number;
  fullVideo: boolean;
  start: number;
  end: number;
}

/** Highest quality at or below 1080p, the same default the server uses. */
export function defaultHeight(probe: ProbeResult): number | null {
  const preferred = probe.qualities.find((quality) => quality.height <= 1080) ?? probe.qualities[0];
  return preferred?.height ?? null;
}

export function findQuality(probe: ProbeResult, height: number | null): VideoQuality | null {
  return probe.qualities.find((quality) => quality.height === height) ?? probe.qualities[0] ?? null;
}

/** Why the current selection can't be downloaded, or null when it can. */
export function selectionProblem(probe: ProbeResult, selection: Selection): string | null {
  if (probe.isLive) return "Active live streams aren't supported. Try again after the stream ends.";
  if (!selection.fullVideo) {
    if (!probe.duration) return "This video doesn't report a duration.";
    if (selection.end - selection.start < 1) return "Select at least one second.";
    if (selection.end > probe.duration + 1) return "The end time is past the end of the video.";
  }
  if (selection.kind !== "mp3" && selection.height === null) return "Pick a video quality first.";
  return null;
}

export interface SizeEstimates {
  video: number | null;
  audio: number | null;
  total: number | null;
}

export function estimateSizes(probe: ProbeResult, selection: Selection): SizeEstimates {
  const { kind, height, bitrate, fullVideo, start, end } = selection;
  const duration = probe.duration;
  const selected = duration ? (fullVideo ? duration : clamp(end - start, 0, duration)) : null;

  let video: number | null = null;
  if (kind !== "mp3") {
    const quality = findQuality(probe, height);
    if (quality?.approxSize) {
      video = duration && selected !== null ? Math.round(quality.approxSize * (selected / duration)) : quality.approxSize;
    }
  }

  const audio = kind !== "mp4" && selected !== null ? Math.round((bitrate * 1000 * selected) / 8) : null;

  const total =
    kind === "mp4"
      ? video
      : kind === "mp3"
        ? audio
        : video !== null || audio !== null
          ? (video ?? 0) + (audio ?? 0)
          : null;

  return { video, audio, total };
}

export function selectedDurationLabel(probe: ProbeResult, selection: Selection): string {
  const { fullVideo, start, end } = selection;
  if (fullVideo || !probe.duration) {
    return probe.duration ? formatDuration(probe.duration) : "Unknown length";
  }
  return formatDuration(Math.max(0, end - start));
}
