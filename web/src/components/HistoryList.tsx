import {
  Download,
  FileAudio,
  History,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { formatBytes, type Job } from "@clipshed/shared";
import { cn } from "../lib/cn";
import { formatDate, kindLabel, rangeText, statusLabel } from "../lib/format";

interface HistoryListProps {
  jobs: Job[];
  onRefresh: () => void;
  onDelete: (job: Job) => void;
  refreshing: boolean;
}

export function HistoryList({
  jobs,
  onRefresh,
  onDelete,
  refreshing,
}: HistoryListProps) {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-zinc-500" />
          <h2 className="text-sm font-semibold text-zinc-300">Recent</h2>
          <span className="text-xs text-zinc-600">{jobs.length}</span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="btn-ghost h-8 gap-1.5 px-2.5 text-xs"
          disabled={refreshing}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
          />
          Refresh
        </button>
      </div>

      {jobs.length === 0 ? (
        <div className="panel-soft px-5 py-8 text-center">
          <History className="mx-auto h-5 w-5 text-zinc-700" />
          <p className="mt-2 text-sm text-zinc-500">No downloads yet.</p>
          <p className="mt-1 text-xs text-zinc-600">
            Your finished files and failed attempts will show up here.
          </p>
        </div>
      ) : (
        <div className="scrollbar-thin max-h-[460px] space-y-2 overflow-auto pr-1">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="panel-soft group flex items-center gap-3 p-2.5 transition hover:border-white/12 hover:bg-white/[0.05]"
            >
              <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
                {job.thumbnail ? (
                  <img
                    src={job.thumbnail}
                    alt=""
                    className="h-full w-full object-cover opacity-80"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-zinc-700">
                    {job.kind === "both"
                      ? "BOTH"
                      : job.kind === "mp4"
                        ? "MP4"
                        : "MP3"}
                  </div>
                )}
                <span className="absolute inset-x-0 bottom-0 bg-black/65 px-1 py-0.5 text-center font-mono text-[9px] text-white/75">
                  {job.kind === "both" ? "BOTH" : kindLabel(job.kind)}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-xs font-medium text-zinc-300">
                    {job.title}
                  </p>
                  <StatusBadge job={job} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-zinc-600">
                  <span>{rangeText(job)}</span>
                  <span className="text-zinc-800">·</span>
                  <span>{formatDate(job.createdAt)}</span>
                  {job.output ? (
                    <>
                      <span className="text-zinc-800">·</span>
                      <span>
                        {formatBytes(
                          job.output.size + (job.audioOutput?.size ?? 0),
                        )}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {job.status === "completed" && job.output ? (
                  <>
                    <a
                      href={job.output.downloadUrl}
                      className="btn-ghost h-8 w-8"
                      aria-label={`Download ${job.title}`}
                      title={job.kind === "mp3" ? "Download MP3" : "Download MP4"}
                    >
                      {job.kind === "mp3" ? (
                        <FileAudio className="h-3.5 w-3.5" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                    </a>
                    {job.audioOutput ? (
                      <a
                        href={job.audioOutput.downloadUrl}
                        className="btn-ghost h-8 w-8"
                        aria-label={`Download ${job.title} MP3`}
                        title="Download MP3"
                      >
                        <FileAudio className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </>
                ) : null}
                {job.status !== "running" &&
                job.status !== "resolving" &&
                job.status !== "queued" ? (
                  <button
                    type="button"
                    onClick={() => onDelete(job)}
                    className="btn-ghost h-8 w-8 hover:text-red-300"
                    aria-label={`Delete ${job.title}`}
                    title="Delete job and file"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-400/70" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StatusBadge({ job }: { job: Job }) {
  const tone =
    job.status === "completed"
      ? "badge-success"
      : job.status === "failed"
        ? "badge-danger"
        : job.status === "running" || job.status === "resolving"
          ? "badge-accent"
          : "";

  return (
    <span className={cn("badge shrink-0 py-0.5 text-[9px]", tone)}>
      {statusLabel(job)}
    </span>
  );
}
