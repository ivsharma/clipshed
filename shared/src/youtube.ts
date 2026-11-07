import { parseTime } from "./time";

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const SHORT_HOSTS = new Set(["youtu.be", "www.youtu.be"]);

export type CanonicalYouTubeUrl =
  | {
      ok: true;
      videoId: string;
      url: string;
      startAt: number | null;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Accepts common YouTube URL shapes and returns a canonical watch URL.
 * Deliberately rejects playlists, channels, search pages, and non-YouTube hosts.
 */
export function canonicalizeYouTubeUrl(input: string): CanonicalYouTubeUrl {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "Paste a YouTube video link first." };
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return { ok: false, error: "That doesn't look like a valid URL." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http and https links are supported." };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: "That URL contains credentials, which aren't supported." };
  }

  const host = parsed.hostname.toLowerCase();
  let videoId: string | null = null;

  if (SHORT_HOSTS.has(host)) {
    videoId = parsed.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    const segments = parsed.pathname.split("/").filter(Boolean);
    const first = segments[0]?.toLowerCase();

    if (first === "watch") {
      videoId = parsed.searchParams.get("v");
    } else if (first && ["shorts", "embed", "live", "v"].includes(first)) {
      videoId = segments[1] ?? null;
    } else if (first === "playlist") {
      return {
        ok: false,
        error: "Playlists aren't supported yet. Paste a link to a single video.",
      };
    } else {
      return {
        ok: false,
        error: "Paste a link to a single YouTube video, Short, or livestream replay.",
      };
    }
  } else {
    return { ok: false, error: "Only YouTube links are supported." };
  }

  if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) {
    return { ok: false, error: "That doesn't look like a YouTube video link." };
  }

  let startAt: number | null = null;
  const rawStart =
    parsed.searchParams.get("t") ??
    parsed.searchParams.get("start") ??
    new URLSearchParams(parsed.hash.replace(/^#/, "")).get("t");
  if (rawStart) {
    startAt = parseTime(rawStart);
  }

  return {
    ok: true,
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    startAt,
  };
}
