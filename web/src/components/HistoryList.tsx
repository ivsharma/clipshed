import { Download, FileAudio, History, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { formatBytes, type Job } from "@clipshed/shared";
import { cn } from "../lib/cn";
import { formatDate, rangeText, statusLabel } from "../lib/format";

interface HistoryListProps {
  jobs: Job[];
  onRefresh: () => void;
  onDelete: (job: Job) => void;
  onClearAll: () => void;
  refreshing: boolean;
  clearing: boolean;
}

const shortKind = (job: Job): string => (job.kind === "both" ? "BOTH" : job.kind === "mp4" ? "MP4" : "MP3");
const ACTIVE = new Set<Job["status"]>(["queued", "resolving", "running"]);

export function HistoryList({ jobs, onRefresh, onDelete, onClearAll, refreshing, clearing }: HistoryListProps) {
  const canClear = jobs.some((job) => !ACTIVE.has(job.status));
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
      <div className="flex items-center justify-between border-b border-[var(--line-strong)] pb-2">
        <div className="flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-[var(--ink-mute)]" />
          <h2 className="mono-label text-[var(--ink)]">Recent activity</h2>
          <span className="font-mono text-[11px] text-[var(--red)]">{String(jobs.length).padStart(2, "0")}</span>
        </div>
        <div className="flex items-center gap-1">
          {canClear ? (
            <button
              type="button"
              onClick={onClearAll}
              className="btn-ghost h-7 gap-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.06em] hover:bg-[var(--red)] hover:text-[var(--on-red)]"
              disabled={clearing}
              title="Delete all finished jobs and their app-private files"
            >
              <Trash2 className="h-3 w-3" />
              {clearing ? "Clearing…" : "Clear all"}
            </button>
          ) : null}
          <button type="button" onClick={onRefresh} className="btn-ghost h-7 gap-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.06em]" disabled={refreshing}>
            <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="border-b border-[var(--line)] py-10 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-mute)]">No exports yet.</p>
          <p className="mt-1 text-[12px] text-[var(--ink-mute)]">Finished files and failed attempts will appear here.</p>
        </div>
      ) : (
        <div className="scrollbar-thin max-h-[440px] overflow-y-auto overflow-x-hidden">
          {/* Rotating status spinners can exceed the row bounds; clipping horizontally
              prevents a scrollbar from appearing and shifting the page. */}
          {jobs.map((job) => {
            const outputs = [job.output, job.audioOutput].filter((output) => Boolean(output));
            const totalSize = outputs.reduce((sum, output) => sum + (output?.size ?? 0), 0);

            return (
              <div
                key={job.id}
                className="group flex items-center gap-3 border-b border-[var(--line)] py-2.5 transition hover:bg-[var(--hover)]"
              >
                <div className="relative h-9 w-16 shrink-0 overflow-hidden border border-[var(--ink)] bg-[var(--ink)]">
                  {job.thumbnail ? (
                    <img src={job.thumbnail} alt="" className="h-full w-full object-cover opacity-85" loading="lazy" referrerPolicy="no-referrer" />
                  ) : null}
                  <span className="absolute bottom-0 left-0 bg-[var(--paper-raised)] px-1 font-mono text-[10px] font-bold text-[var(--ink)]">
                    {shortKind(job)}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13px] font-medium text-[var(--ink)]">{job.title}</p>
                    <StatusBadge job={job} />
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[10px] text-[var(--ink-mute)]">
                    <span>{rangeText(job)}</span>
                    <span>/</span>
                    <span>{formatDate(job.createdAt)}</span>
                    {totalSize > 0 ? (
                      <>
                        <span>/</span>
                        <span>{formatBytes(totalSize)}</span>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  {job.status === "completed" && job.output ? (
                    <>
                      <a
                        href={job.output.downloadUrl}
                        className="btn-ghost h-7 w-7"
                        aria-label={`Download ${job.title}`}
                        title={job.kind === "mp3" ? "Download MP3" : "Download MP4"}
                      >
                        {job.kind === "mp3" ? <FileAudio className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                      </a>
                      {job.audioOutput ? (
                        <a href={job.audioOutput.downloadUrl} className="btn-ghost h-7 w-7" aria-label={`Download ${job.title} MP3`} title="Download MP3">
                          <FileAudio className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </>
                  ) : null}
                  {job.status !== "running" && job.status !== "resolving" && job.status !== "queued" ? (
                    <button
                      type="button"
                      onClick={() => onDelete(job)}
                      className="btn-ghost h-7 w-7 hover:bg-[var(--red)] hover:text-[var(--on-red)]"
                      aria-label={`Delete ${job.title}`}
                      title="Delete job and files"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--red)]" />
                  )}
                </div>
              </div>
            );
          })}
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

  return <span className={cn("badge shrink-0", tone)}>{statusLabel(job)}</span>;
}
