import type { ProbeResult, VideoQuality } from "@clipshed/shared";
import { AppError } from "../errors";

const DEFAULT_MAX_HEIGHT = 1080;

/** Picks the requested height, or the closest lower one. Defaults to 1080p or below. */
export function chooseQuality(probe: ProbeResult, requestedHeight: number | null): VideoQuality {
  if (probe.qualities.length === 0) {
    throw new AppError(
      "NO_VIDEO_FORMAT",
      "This video doesn't have a downloadable video stream. Try MP3 instead.",
      422,
    );
  }

  const fallback = probe.qualities.find((quality) => quality.height <= DEFAULT_MAX_HEIGHT);
  const target = requestedHeight ?? (fallback ?? probe.qualities[0]).height;

  return (
    probe.qualities.find((quality) => quality.height <= target) ??
    probe.qualities[probe.qualities.length - 1]
  );
}

/** yt-dlp format selector. Prefers H.264 when asked, since it plays everywhere. */
export function formatSelector(quality: VideoQuality, preferH264: boolean): string {
  const h = quality.height;
  if (preferH264 && quality.h264) {
    return `bv*[height<=${h}][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=${h}]+ba/b[height<=${h}]`;
  }
  return `bv*[height<=${h}]+ba/b[height<=${h}]`;
}
