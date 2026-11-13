import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle, Download, FileAudio, FileVideo, Loader2, RotateCcw, X } from "lucide-react";
import {
  PLATFORM_LABELS,
  formatBytes,
  formatClock,
  formatDuration,
  formatEta,
  formatSpeed,
  type Job,
  type JobOutput,
} from "@clipshed/shared";
import { cn } from "../lib/cn";
import { kindLabel, rangeText, stageLabel, statusLabel } from "../lib/format";

interface JobPanelProps {
  job: Job;
  onCancel: () => void;
  onReset: () => void;
  onRetry: () => void;
}

export function JobPanel({ job, onCancel, onReset, onRetry }: JobPanelProps) {
  if (job.status === "completed" && job.output) {
    return <Finished job={job} output={job.output} onReset={onReset} />;
  }

  if (job.status === "failed" || job.status === "cancelled") {
    const failed = job.status === "failed";
    return (
      <Shell tone={failed ? "red" : "neutral"}>
        <Header
          icon={failed ? <AlertTriangle className="h-6 w-6" /> : <X className="h-6 w-6" />}
          iconClass={failed ? "bg-red-400/12 text-red-300" : "bg-white/6 text-zinc-400"}
          title={failed ? "That didn't work" : "Cancelled"}
        >
          <p className={cn("mt-1 text-sm leading-relaxed", failed ? "text-red-100/70" : "text-zinc-400")}>
            {failed
              ? (job.error?.message ?? "The download failed.")
              : "The download was stopped and partial files were removed."}
          </p>
          {failed && job.error?.details ? <Diagnostics text={job.error.details} /> : null}
        </Header>
        <Actions>
          <ActionButton primary onClick={onRetry}>
            <RotateCcw className="h-4 w-4" />
            Try again
          </ActionButton>
          <ActionButton onClick={onReset}>Start over</ActionButton>
        </Actions>
      </Shell>
    );
  }

  return <Running job={job} onCancel={onCancel} />;
}

function Finished({ job, output, onReset }: { job: Job; output: JobOutput; onReset: () => void }) {
  const outputs = [output, job.audioOutput].filter((item): item is JobOutput => Boolean(item));
  const multiple = outputs.length > 1;

  return (
    <Shell tone="green">
      <Header
        icon={<CheckCircle className="h-6 w-6" />}
        iconClass="bg-emerald-400/12 text-emerald-300"
        title={multiple ? "Your files are ready" : "Your file is ready"}
        badges={
          <>
            <span className="badge badge-success">{kindLabel(job.kind)}</span>
            <span className="badge">{rangeText(job)}</span>
          </>
        }
      >
        <p className="mt-1 text-xs text-zinc-500">{job.uploader ?? PLATFORM_LABELS[job.platform]}</p>
        <div className="mt-4 space-y-2">
          {outputs.map((file) => {
            const isAudio = file.mime === "audio/mpeg";
            return (
              <div
                key={file.filename}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/7 bg-white/[0.025] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("badge shrink-0", isAudio ? "badge-accent" : "badge-success")}>
                      {isAudio ? "MP3" : "MP4"}
                    </span>
                    <span className="truncate text-xs font-medium text-zinc-300">{file.filename}</span>
                  </div>
                  <div className="mt-1 text-[10px] text-zinc-600">
                    {formatBytes(file.size)}
                    {file.duration ? ` · ${formatDuration(file.duration)}` : ""}
                  </div>
                </div>
                <a
                  href={file.downloadUrl}
                  className="btn-ghost h-8 w-8 shrink-0"
                  aria-label={`Download ${isAudio ? "MP3" : "MP4"}`}
                  title={`Download ${isAudio ? "MP3" : "MP4"}`}
                >
                  {isAudio ? <FileAudio className="h-4 w-4" /> : <FileVideo className="h-4 w-4" />}
                </a>
              </div>
            );
          })}
        </div>
      </Header>

      <div className={cn("mt-6 grid gap-2.5", multiple && "sm:grid-cols-2")}>
        {outputs.map((file, index) => {
          const isAudio = file.mime === "audio/mpeg";
          return (
            <a
              key={file.filename}
              href={file.downloadUrl}
              className={cn("h-12 px-5 text-sm", index === 0 ? "btn-primary" : "btn-secondary")}
            >
              <Download className="h-4 w-4" />
              Download {isAudio ? "MP3" : "MP4"}
            </a>
          );
        })}
      </div>

      <Actions>
        <ActionButton onClick={onReset} className="flex-1">
          <RotateCcw className="h-4 w-4" />
          Convert another
        </ActionButton>
      </Actions>

      <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">
        Your browser saves the files to its downloads folder. The copies on the server are cleaned up automatically
        after a while.
      </p>
    </Shell>
  );
}

function Running({ job, onCancel }: { job: Job; onCancel: () => void }) {
  const active = job.status === "running" || job.status === "resolving";
  const cancelling = job.stage === "cancelling";
  const Icon = job.kind === "mp3" ? FileAudio : FileVideo;
  const percent = job.progress.percent;

  return (
    <div className="panel animate-fade-in overflow-hidden" id="job-panel">
      <div className="h-1 w-full bg-gradient-to-r from-red-500 via-orange-400 to-amber-300" />
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500/15 to-orange-500/15 text-orange-300">
            <Icon className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="line-clamp-1 text-base font-semibold text-white sm:text-lg">{job.title}</h2>
              <span className="badge badge-accent">{kindLabel(job.kind)}</span>
              <span className="badge">{rangeText(job)}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
              {active ? <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-400" /> : null}
              <span>{statusLabel(job)}</span>
              {job.progress.detail && job.progress.detail !== statusLabel(job) ? (
                <>
                  <span className="text-zinc-700">·</span>
                  <span className="truncate">{job.progress.detail}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-6" aria-live="polite">
          <div className="mb-2 flex items-end justify-between gap-3">
            <span className="text-xs font-medium text-zinc-400">{stageLabel(job)}</span>
            <span className="font-mono text-lg font-semibold tracking-tight text-white">
              {percent === null ? "…" : `${Math.round(percent)}%`}
            </span>
          </div>

          <div className="relative h-2.5 overflow-hidden rounded-full border border-white/6 bg-white/6">
            {percent === null ? (
              <div className="progress-shimmer h-full w-1/2 rounded-full" />
            ) : (
              <div
                className="h-full rounded-full bg-gradient-to-r from-red-500 via-orange-400 to-amber-300 transition-[width] duration-300 ease-out"
                style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
              />
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
            <Stat
              label="Downloaded"
              value={
                job.progress.totalBytes
                  ? `${formatBytes(job.progress.downloadedBytes)} / ${formatBytes(job.progress.totalBytes)}`
                  : formatBytes(job.progress.downloadedBytes)
              }
            />
            <Stat label="Speed" value={formatSpeed(job.progress.speed)} />
            <Stat label="ETA" value={formatEta(job.progress.eta)} />
            <Stat
              label="Range"
              value={job.range ? `${formatClock(job.range.start)} – ${formatClock(job.range.end)}` : "Full video"}
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-[11px] leading-relaxed text-zinc-600">
            {job.kind === "mp3"
              ? "Audio is downloaded and converted to MP3 locally."
              : "Video and audio are downloaded and merged locally."}
          </p>
          <ActionButton onClick={onCancel} disabled={cancelling} className="h-9 px-3.5 text-xs">
            <X className="h-3.5 w-3.5" />
            {cancelling ? "Cancelling…" : "Cancel"}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

function Shell({ tone, children }: { tone: "green" | "red" | "neutral"; children: ReactNode }) {
  const bar =
    tone === "green"
      ? "from-emerald-400 via-teal-400 to-emerald-500"
      : tone === "red"
        ? "from-red-500 to-rose-500"
        : null;
  return (
    <div className="panel animate-fade-in overflow-hidden">
      {bar ? <div className={cn("h-1 w-full bg-gradient-to-r", bar)} /> : null}
      <div className="p-5 sm:p-6">{children}</div>
    </div>
  );
}

function Header({
  icon,
  iconClass,
  title,
  badges,
  children,
}: {
  icon: ReactNode;
  iconClass: string;
  title: string;
  badges?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", iconClass)}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {badges}
        </div>
        {children}
      </div>
    </div>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">{children}</div>;
}

function ActionButton({
  children,
  onClick,
  primary,
  disabled,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(primary ? "btn-primary h-12 flex-1 px-6 text-sm" : "btn-secondary h-12 px-5 text-sm", className)}
    >
      {children}
    </button>
  );
}

function Diagnostics({ text }: { text: string }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs font-medium text-zinc-500 transition hover:text-zinc-300">
        Show diagnostics
      </summary>
      <pre className="scrollbar-thin mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/8 bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-zinc-500">
        {text}
      </pre>
    </details>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/6 bg-black/15 px-2.5 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600">{label}</div>
      <div className="mt-0.5 truncate font-mono text-[11px] text-zinc-300">{value}</div>
    </div>
  );
}
