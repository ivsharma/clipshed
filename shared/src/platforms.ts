import { parseTime } from "./time";

export type PlatformId = "youtube" | "facebook" | "instagram";

export const PLATFORM_LABELS: Record<PlatformId, string> = {
  youtube: "YouTube",
  facebook: "Facebook",
  instagram: "Instagram",
};

export interface MediaSource {
  platform: PlatformId;
  mediaId: string;
  /** Canonical URL that yt-dlp is given. */
  url: string;
  startAt: number | null;
}

export type ResolvedMedia = ({ ok: true } & MediaSource) | { ok: false; error: string };

type ParseResult = { mediaId: string; url: string } | { error: string };

interface PlatformRule {
  id: PlatformId;
  hosts: readonly string[];
  parse: (url: URL) => ParseResult;
}

const segmentsOf = (url: URL): string[] => url.pathname.split("/").filter(Boolean);

const fail = (error: string): ParseResult => ({ error });

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const FACEBOOK_ID = /^\d{5,}$/;
const INSTAGRAM_CODE = /^[A-Za-z0-9_-]{5,}$/;

const youtube: PlatformRule = {
  id: "youtube",
  hosts: [
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
    "youtu.be",
    "www.youtu.be",
  ],
  parse(url) {
    const segments = segmentsOf(url);
    let id: string | null;

    if (url.hostname.endsWith("youtu.be")) {
      id = segments[0] ?? null;
    } else {
      const first = segments[0]?.toLowerCase();
      if (first === "watch") id = url.searchParams.get("v");
      else if (first && ["shorts", "embed", "live", "v"].includes(first)) id = segments[1] ?? null;
      else if (first === "playlist") {
        return fail("Playlists aren't supported yet. Paste a link to a single video.");
      } else {
        return fail("Paste a link to a single YouTube video, Short, or livestream replay.");
      }
    }

    if (!id || !YOUTUBE_ID.test(id)) {
      return fail("That doesn't look like a YouTube video link.");
    }
    return { mediaId: id, url: `https://www.youtube.com/watch?v=${id}` };
  },
};

const facebook: PlatformRule = {
  id: "facebook",
  hosts: ["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com", "fb.watch"],
  parse(url) {
    const segments = segmentsOf(url);

    if (url.hostname === "fb.watch") {
      const code = segments[0];
      return code ? { mediaId: code, url: url.href } : fail("That doesn't look like a Facebook video link.");
    }

    const first = segments[0]?.toLowerCase();
    let id: string | null = null;
    let isReel = false;

    if (first === "watch") id = url.searchParams.get("v");
    else if (first === "reel") {
      id = segments[1] ?? null;
      isReel = true;
    } else if (first === "videos") id = segments[1] ?? null;
    else if (segments[1] === "videos") id = segments[2] ?? null;

    if (!id || !FACEBOOK_ID.test(id)) {
      return fail("Paste a link to a Facebook video or reel.");
    }
    return {
      mediaId: id,
      url: isReel ? `https://www.facebook.com/reel/${id}` : `https://www.facebook.com/watch/?v=${id}`,
    };
  },
};

const instagram: PlatformRule = {
  id: "instagram",
  hosts: ["instagram.com", "www.instagram.com"],
  parse(url) {
    const [kind, code] = segmentsOf(url);
    if (!kind || !code) return fail("Paste a link to an Instagram post or reel.");
    if (!["p", "reel", "reels", "tv"].includes(kind)) {
      return fail("Stories and profiles aren't supported. Paste a post or reel link.");
    }
    if (!INSTAGRAM_CODE.test(code)) return fail("That doesn't look like an Instagram link.");

    const route = kind === "reels" ? "reel" : kind;
    return { mediaId: code, url: `https://www.instagram.com/${route}/${code}/` };
  },
};

const PLATFORMS: PlatformRule[] = [youtube, facebook, instagram];

function parseUrl(input: string): URL | null {
  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(input) ? input : `https://${input}`;
  try {
    return new URL(withProtocol);
  } catch {
    return null;
  }
}

/** Turns any pasted link into a canonical source for a supported platform. */
export function resolveMediaUrl(input: string): ResolvedMedia {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "Paste a video link first." };

  const url = parseUrl(trimmed);
  if (!url) return { ok: false, error: "That doesn't look like a valid URL." };
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http and https links are supported." };
  }
  if (url.username || url.password) {
    return { ok: false, error: "That URL contains credentials, which aren't supported." };
  }

  const host = url.hostname.toLowerCase();
  const platform = PLATFORMS.find((candidate) => candidate.hosts.includes(host));
  if (!platform) {
    return {
      ok: false,
      error: `Only ${Object.values(PLATFORM_LABELS).join(", ")} links are supported right now.`,
    };
  }

  const parsed = platform.parse(url);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const rawStart =
    url.searchParams.get("t") ??
    url.searchParams.get("start") ??
    new URLSearchParams(url.hash.slice(1)).get("t");

  return {
    ok: true,
    platform: platform.id,
    mediaId: parsed.mediaId,
    url: parsed.url,
    startAt: rawStart ? parseTime(rawStart) : null,
  };
}
