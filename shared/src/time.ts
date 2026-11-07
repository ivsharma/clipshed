/**
 * Parses user-entered time values into seconds.
 *
 * Accepted:
 *   90            -> 90 seconds
 *   1:30          -> 1 minute 30 seconds
 *   01:02:03.5    -> 1 hour 2 minutes 3.5 seconds
 *   1h2m3s
 *   1h 2m 3s
 *   2m
 *   30s
 *
 * Returns null for invalid input.
 */
export function parseTime(input: string): number | null {
  if (typeof input !== "string") return null;

  const value = input.trim().toLowerCase().replace(/,/g, ".");
  if (!value) return null;

  if (value.includes(":")) {
    const parts = value.split(":");
    if (parts.length > 3) return null;

    const numbers = parts.map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return null;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    });

    if (numbers.some((number) => number === null)) return null;

    if (parts.length === 2) {
      const [minutes, seconds] = numbers as number[];
      if (seconds >= 60) return null;
      return minutes * 60 + seconds;
    }

    const [hours, minutes, seconds] = numbers as number[];
    if (minutes >= 60 || seconds >= 60) return null;
    return hours * 3600 + minutes * 60 + seconds;
  }

  const unitPattern =
    /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)(?![a-z])/g;
  let total = 0;
  let matched = false;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = unitPattern.exec(value)) !== null) {
    const between = value.slice(lastIndex, match.index).trim();
    if (between) return null;

    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) return null;

    const unit = match[2];
    if (unit.startsWith("h")) total += amount * 3600;
    else if (unit.startsWith("m")) total += amount * 60;
    else total += amount;

    matched = true;
    lastIndex = unitPattern.lastIndex;
  }

  if (matched) {
    if (value.slice(lastIndex).trim()) return null;
    return total;
  }

  if (/^\d+(?:\.\d+)?$/.test(value)) {
    return Number(value);
  }

  return null;
}

/** Formats seconds as H:MM:SS, or M:SS when under one hour. */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

/** Formats seconds as a human-friendly duration: 1h 02m 03s. */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(secs).padStart(2, "0")}s`;
  }
  return `${secs}s`;
}

/** Compact label used in filenames: 15m00s-20m00s. */
export function formatRangeSlug(start: number, end: number): string {
  const part = (value: number): string => {
    const safe = Math.max(0, Math.round(value));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;

    if (hours > 0) {
      return `${hours}h${String(minutes).padStart(2, "0")}m${String(secs).padStart(2, "0")}s`;
    }
    if (minutes > 0) {
      return `${minutes}m${String(secs).padStart(2, "0")}s`;
    }
    return `${secs}s`;
  };

  return `${part(start)}-${part(end)}`;
}

/** Formats seconds the way yt-dlp's --download-sections expects. */
export function formatSectionTimestamp(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const wholeSeconds = Math.floor(secs);
  const millis = Math.round((secs - wholeSeconds) * 1000);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
    wholeSeconds,
  ).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}
