import { useState } from "react";
import { Clock, ListVideo, Play, User } from "lucide-react";
import { PLATFORM_LABELS, formatDuration, type ProbeResult } from "@clipshed/shared";

export function VideoCard({ video }: { video: ProbeResult }) {
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
          <span className="badge badge-accent">{PLATFORM_LABELS[video.platform]}</span>
          <span className="badge badge-success">Ready</span>
          <span className="badge">{video.qualities.length} qualities</span>
          {video.chapters.length > 0 ? <span className="badge">{video.chapters.length} chapters</span> : null}
          {video.ageLimit ? <span className="badge badge-danger">18+</span> : null}
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
            {video.mediaId}
          </span>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-zinc-500">
          Pick a format and an optional time range. Only the selected range is downloaded.
        </p>
      </div>
    </div>
  );
}

export function ProbeSkeleton() {
  return (
    <div className="panel mt-4 animate-fade-in p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="skeleton aspect-video w-full rounded-2xl sm:w-[230px]" />
        <div className="flex-1 space-y-3 py-2">
          <div className="skeleton h-3 w-24 rounded-full" />
          <div className="skeleton h-5 w-4/5 rounded-lg" />
          <div className="skeleton h-3 w-1/2 rounded-full" />
          <div className="skeleton h-3 w-2/3 rounded-full" />
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="skeleton h-44 rounded-2xl" />
        <div className="skeleton h-44 rounded-2xl" />
      </div>
    </div>
  );
}
