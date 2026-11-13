import { useState } from "react";
import { Clock, ListVideo, Play, User } from "lucide-react";
import { PLATFORM_LABELS, formatDuration, type ProbeResult } from "@clipshed/shared";

export function VideoCard({ video }: { video: ProbeResult }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className="animate-fade-in flex flex-col gap-5 sm:flex-row sm:items-start">
      <div className="relative aspect-video w-full shrink-0 overflow-hidden border border-[var(--ink)] bg-[var(--ink)] sm:w-[220px]">
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
          <div className="flex h-full items-center justify-center text-[var(--paper-raised)]">
            <Play className="h-8 w-8" />
          </div>
        )}

        <span className="absolute bottom-0 right-0 border-l border-t border-[var(--ink)] bg-[var(--paper-raised)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--ink)]">
          {video.duration ? formatDuration(video.duration) : "LIVE / UNKNOWN"}
        </span>

        {video.isLive ? (
          <span className="absolute left-0 top-0 flex items-center gap-1 bg-[var(--red)] px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.12em] text-white">
            <span className="h-1.5 w-1.5 animate-pulse bg-white" />
            LIVE
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

        <h2 className="display text-[1.65rem] leading-[1.05] text-[var(--ink)] sm:text-[1.9rem]">{video.title}</h2>

        <div className="mt-3 grid gap-x-5 gap-y-1 font-mono text-[11px] tracking-[0.04em] text-[var(--ink-mute)] sm:grid-cols-2">
          <span className="flex items-center gap-1.5 truncate">
            <User className="h-3 w-3 shrink-0" />
            {video.uploader ?? "UNKNOWN CHANNEL"}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 shrink-0" />
            {video.duration ? formatDuration(video.duration) : "DURATION UNKNOWN"}
          </span>
          <span className="flex items-center gap-1.5 truncate">
            <ListVideo className="h-3 w-3 shrink-0" />
            ID {video.mediaId}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 bg-[var(--green)]" />
            METADATA LOADED
          </span>
        </div>
      </div>
    </div>
  );
}

export function ProbeSkeleton() {
  return (
    <div className="mt-6 border border-[var(--line-strong)] bg-[var(--paper-raised)] p-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="skeleton aspect-video w-full sm:w-[220px]" />
        <div className="flex-1 space-y-3 py-1">
          <div className="skeleton h-3 w-28" />
          <div className="skeleton h-6 w-4/5" />
          <div className="skeleton h-3 w-1/2" />
          <div className="skeleton h-3 w-2/3" />
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="skeleton h-36" />
        <div className="skeleton h-36" />
      </div>
    </div>
  );
}
