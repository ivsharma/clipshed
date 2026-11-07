import type { ProbeResult, Settings } from "@clipshed/shared";
import { config } from "../config";
import { probeVideo } from "./ytdlp";

interface CacheEntry {
  value: ProbeResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ProbeResult>>();

export async function getVideoInfo(
  url: string,
  videoId: string,
  settings: Settings,
): Promise<ProbeResult> {
  const hit = cache.get(videoId);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value;
  }

  const pending = inflight.get(videoId);
  if (pending) return pending;

  const promise = probeVideo(url, videoId, settings)
    .then((value) => {
      cache.set(videoId, {
        value,
        expiresAt: Date.now() + config.probeCacheTtlMs,
      });

      while (cache.size > 100) {
        const oldest = cache.keys().next().value;
        if (!oldest) break;
        cache.delete(oldest);
      }

      return value;
    })
    .finally(() => {
      inflight.delete(videoId);
    });

  inflight.set(videoId, promise);
  return promise;
}

export function clearProbeCache(videoId?: string): void {
  if (videoId) cache.delete(videoId);
  else cache.clear();
}
