import { useState } from "react";
import { Clock, ListVideo, Play, User } from "lucide-react";
import { formatDuration, type ProbeResult } from "@clipshed/shared";
import { cn } from "../lib/cn";

interface VideoCardProps {
  video: ProbeResult;
}

export function VideoCard({ video }: VideoCardProps) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className="animate-fade-in flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-2xl border border-white/8 bg-black/40 sm:w-[230px]">
        {video.thumbnail && !imageFailed ? (
          <img
            src={video.thumbnail}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950">
            <Play className="h-8 w-8 text-zinc-600" />
          </div>
        )}

        <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[11px] font-medium text-white/90 backdrop-blur">
          {video.duration ? formatDuration(video.duration) : "live / unknown"}
        </span>

        {video.isLive ? (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            Live
          </span>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="badge badge-success">Ready</span>
          <span className="badge">{video.qualities.length} qualities</span>
          {video.chapters.length > 0 ? (
            <span className="badge">{video.chapters.length} chapters</span>
          ) : null}
          {video.ageLimit ? (
            <span className="badge badge-danger">18+</span>
          ) : null}
        </div>

        <h2 className="line-clamp-2 text-lg font-semibold leading-snug tracking-tight text-white sm:text-xl">
          {video.title}
        </h2>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
          {video.uploader ? (
            <span className="inline-flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              {video.uploader}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {video.duration ? formatDuration(video.duration) : "Duration unknown"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ListVideo className="h-3.5 w-3.5" />
            {video.videoId}
          </span>
        </div>

        <p className={cn("mt-3 text-xs leading-relaxed text-zinc-500")}>
          Pick a format and an optional time range. Only the selected range is
          downloaded.
        </p>
      </div>
    </div>
  );
}
