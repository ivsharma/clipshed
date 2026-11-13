import {
  type Chapter,
  type MediaSource,
  type ProbeResult,
  type Settings,
  type VideoQuality,
} from "@clipshed/shared";
import { config } from "../config";
import { AppError, mapYtDlpError, stripAnsi } from "../errors";
import { runCommand } from "../lib/process";
import { assertBinaries } from "../services/binaries";
import { probeArgs } from "./args";

type Json = Record<string, unknown>;

const isJson = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asArray = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isJson) : []);

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const tbr = (format: Json): number => asNumber(format.tbr) ?? 0;

const byTbrDesc = (a: Json, b: Json): number => tbr(b) - tbr(a);

function estimateBytes(format: Json, duration: number | null): number | null {
  const exact = asNumber(format.filesize) ?? asNumber(format.filesize_approx);
  if (exact) return exact;
  const rate = asNumber(format.tbr);
  return rate && duration ? Math.round((rate * 1000 * duration) / 8) : null;
}

function codecLabel(vcodec: string): string {
  const codec = vcodec.toLowerCase();
  if (codec.startsWith("avc1") || codec.startsWith("h264")) return "H.264";
  if (codec.startsWith("vp09") || codec.startsWith("vp9")) return "VP9";
  if (codec.startsWith("av01")) return "AV1";
  if (codec.startsWith("hev1") || codec.startsWith("hvc1")) return "HEVC";
  return codec.split(".")[0]?.toUpperCase() ?? codec.toUpperCase();
}

const isVideoFormat = (format: Json): boolean => {
  const vcodec = asString(format.vcodec);
  const ext = asString(format.ext);
  const note = (asString(format.format_note) ?? "").toLowerCase();
  return Boolean(vcodec && vcodec !== "none" && vcodec !== "images") && ext !== "mhtml" && !note.includes("storyboard");
};

/** Groups video formats by height and estimates the size of each quality. */
function buildQualities(formats: Json[], duration: number | null): VideoQuality[] {
  const audioOnly = formats.filter((format) => {
    const vcodec = asString(format.vcodec);
    return (!vcodec || vcodec === "none") && asString(format.acodec) !== null;
  });
  const audioBytes = audioOnly.length ? estimateBytes([...audioOnly].sort(byTbrDesc)[0], duration) : null;

  const groups = new Map<number, Json[]>();
  for (const format of formats) {
    const height = asNumber(format.height);
    if (!height || height <= 0 || !isVideoFormat(format)) continue;
    groups.set(height, [...(groups.get(height) ?? []), format]);
  }

  return [...groups.entries()]
    .map(([height, group]): VideoQuality => {
      const fps = Math.max(...group.map((format) => asNumber(format.fps) ?? 0));
      const codecs = [...new Set(group.map((format) => asString(format.vcodec)).filter((v): v is string => Boolean(v)).map(codecLabel))];
      const h264 = group.some((format) => /^(avc1|h264)/i.test(asString(format.vcodec) ?? ""));

      // Prefer plain HTTP formats for the estimate; HLS variants often list inflated bitrates.
      const direct = group.filter((format) => /^https?$/i.test(asString(format.protocol) ?? ""));
      const best = [...(direct.length ? direct : group)].sort(byTbrDesc)[0];
      const videoBytes = best ? estimateBytes(best, duration) : null;

      return {
        height,
        label: `${height}p${fps >= 50 ? "60" : ""}`,
        fps,
        h264,
        codecs,
        approxSize: videoBytes === null ? null : videoBytes + (audioBytes ?? 0),
      };
    })
    .sort((a, b) => b.height - a.height);
}

function normalize(info: Json, source: MediaSource): ProbeResult {
  const duration = asNumber(info.duration);
  const bestThumbnail = asArray(info.thumbnails).sort((a, b) => (asNumber(b.width) ?? 0) - (asNumber(a.width) ?? 0))[0];

  const chapters: Chapter[] = asArray(info.chapters)
    .map((chapter, index) => ({
      start: asNumber(chapter.start_time) ?? 0,
      end: asNumber(chapter.end_time) ?? 0,
      title: asString(chapter.title) ?? `Chapter ${index + 1}`,
    }))
    .filter((chapter) => chapter.end > chapter.start)
    .sort((a, b) => a.start - b.start);

  const liveStatus = asString(info.live_status);

  return {
    platform: source.platform,
    mediaId: source.mediaId,
    url: source.url,
    title: asString(info.title) ?? "Untitled video",
    uploader: asString(info.uploader) ?? asString(info.channel),
    duration: duration && duration > 0 ? duration : null,
    thumbnail: asString(info.thumbnail) ?? asString(bestThumbnail?.url),
    qualities: buildQualities(asArray(info.formats), duration),
    chapters,
    isLive: info.is_live === true || liveStatus === "is_live",
    liveStatus,
    ageLimit: asNumber(info.age_limit),
    availability: asString(info.availability),
    // Set per request by the route; the cache is shared across links to the same video.
    suggestedStart: null,
  };
}

function parseJson(stdout: string): Json {
  const text = stdout.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  let parsed: unknown;
  try {
    parsed = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
  } catch {
    throw new AppError("PROBE_PARSE", "The video information came back in an unexpected format. Try again.", 502);
  }
  if (!isJson(parsed)) throw new AppError("PROBE_PARSE", "Could not read the video information.", 502);
  return parsed;
}

async function fetchProbe(source: MediaSource, settings: Settings): Promise<ProbeResult> {
  await assertBinaries();

  const result = await runCommand(config.ytdlpPath, probeArgs(source.url, settings), {
    cwd: config.rootDir,
    timeoutMs: 120_000,
  });

  if (result.timedOut) {
    throw new AppError("PROBE_TIMEOUT", "The site took too long to respond. Try again.", 504, stripAnsi(result.stderr).slice(-2000));
  }
  if (result.code !== 0) throw mapYtDlpError(result.stderr, "Could not read this video.");

  const info = parseJson(result.stdout);
  if (info._type === "playlist" || Array.isArray(info.entries)) {
    throw new AppError("PLAYLIST_UNSUPPORTED", "Playlists aren't supported yet. Paste a link to a single video.");
  }

  return normalize(info, source);
}

interface CacheEntry {
  value: ProbeResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ProbeResult>>();
const MAX_CACHE_ENTRIES = 100;

/** Reads a video's metadata, reusing a recent result and merging duplicate requests. */
export async function getProbe(source: MediaSource, settings: Settings): Promise<ProbeResult> {
  const key = `${source.platform}:${source.mediaId}`;

  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = fetchProbe(source, settings)
    .then((value) => {
      cache.set(key, { value, expiresAt: Date.now() + config.probeCacheTtlMs });
      while (cache.size > MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
      }
      return value;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}
