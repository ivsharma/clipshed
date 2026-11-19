import type { ReactNode } from "react";
import { useState } from "react";
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
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { formatDate, kindLabel, rangeText, stageLabel, statusLabel } from "../lib/format";

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
          icon={failed ? <AlertTriangle className="h-5 w-5" /> : <X className="h-5 w-5" />}
          tone={failed ? "red" : "neutral"}
          title={failed ? "Export failed" : "Export cancelled"}
        >
          <p className={cn("mt-2 text-sm leading-relaxed", failed ? "text-[var(--red)]" : "text-[var(--ink-soft)]")}>
            {failed ? (job.error?.message ?? "The download failed.") : "The download was stopped and partial files were removed."}
          </p>
          {failed && job.error?.details ? <Diagnostics text={job.error.details} /> : null}
        </Header>
        <Actions>
          <ActionButton primary onClick={onRetry}>
            <RotateCcw className="h-3.5 w-3.5" />
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
  const isAndroid = /Android/i.test(navigator.userAgent);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<{ text: string; error: boolean } | null>(null);

  const handleDownload = async (file: JobOutput) => {
    if (!isAndroid) return;
    setSavingKey(file.filename);
    setSaveNote(null);
    try {
      const result = await api.saveOutput(job.id, file.mime === "audio/mpeg" ? "mp3" : "mp4");
      setSaveNote({ text: `Saved ${result.filename} to Downloads/Clipshed.`, error: false });
    } catch (error) {
      setSaveNote({ text: error instanceof Error ? error.message : "Could not save the file.", error: true });
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Shell tone="green">
      <div className="mb-4 flex items-center justify-between border-b border-[var(--line-strong)] pb-3">
        <span className="mono-label text-[var(--green)]">Delivery note</span>
        <span className="font-mono text-[11px] text-[var(--ink-mute)]">{multiple ? "2 FILES" : "1 FILE"}</span>
      </div>

      <Header
        icon={<CheckCircle className="h-5 w-5" />}
        tone="green"
        title={multiple ? "Your files are ready" : "Your file is ready"}
        badges={
          <>
            <span className="badge badge-success">{kindLabel(job.kind)}</span>
            <span className="badge">{rangeText(job)}</span>
          </>
        }
      >
        <p className="mt-1 font-mono text-[11px] text-[var(--ink-mute)]">
          {job.uploader ?? PLATFORM_LABELS[job.platform]} / {formatDate(job.finishedAt ?? job.createdAt)}
        </p>
      </Header>

      <div className="mt-4 border border-[var(--line-strong)]">
        {outputs.map((file) => {
          const isAudio = file.mime === "audio/mpeg";
          return (
            <div
              key={file.filename}
              className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2.5 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn("badge shrink-0", isAudio ? "badge-accent" : "badge-success")}>
                    {isAudio ? "MP3" : "MP4"}
                  </span>
                  <span className="truncate font-mono text-[11px] text-[var(--ink-soft)]">{file.filename}</span>
                </div>
                <div className="mt-1 font-mono text-[10px] text-[var(--ink-mute)]">
                  {formatBytes(file.size)}
                  {file.duration ? ` / ${formatDuration(file.duration)}` : ""}
                </div>
              </div>
              <a
                href={file.downloadUrl}
                onClick={(event) => {
                  if (!isAndroid) return;
                  event.preventDefault();
                  void handleDownload(file);
                }}
                className="btn-ghost h-8 w-8 shrink-0"
                aria-label={`Download ${isAudio ? "MP3" : "MP4"}`}
                title={`Download ${isAudio ? "MP3" : "MP4"}`}
              >
                {savingKey === file.filename ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isAudio ? (
                  <FileAudio className="h-4 w-4" />
                ) : (
                  <FileVideo className="h-4 w-4" />
                )}
              </a>
            </div>
          );
        })}
      </div>

      <div className={cn("mt-4 grid gap-2", multiple && "sm:grid-cols-2")}>
        {outputs.map((file, index) => {
          const isAudio = file.mime === "audio/mpeg";
          return (
            <a key={file.filename} href={file.downloadUrl} onClick={(event) => {
              if (!isAndroid) return;
              event.preventDefault();
              void handleDownload(file);
            }} className={cn("h-11 px-4", index === 0 ? "btn-primary" : "btn-secondary")}>
              {savingKey === file.filename ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {savingKey === file.filename ? "Saving…" : `Download ${isAudio ? "MP3" : "MP4"}`}
            </a>
          );
        })}
      </div>

      <Actions>
        <ActionButton onClick={onReset} className="flex-1">
          <RotateCcw className="h-3.5 w-3.5" />
          Convert another
        </ActionButton>
      </Actions>

      {saveNote ? (
        <p className={cn("mt-3 font-mono text-[10px] leading-relaxed", saveNote.error ? "text-[var(--red)]" : "text-[var(--green)]")}>
          {saveNote.text}
        </p>
      ) : null}

      <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-[0.04em] text-[var(--ink-mute)]">
        {isAndroid
          ? "FILES ARE SAVED TO DOWNLOADS/CLIPSHED. SERVER COPIES ARE CLEANED UP AUTOMATICALLY."
          : "YOUR BROWSER SAVES THE FILES TO ITS DOWNLOADS FOLDER. SERVER COPIES ARE CLEANED UP AUTOMATICALLY."}
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
    <div className="panel animate-fade-in">
      <div className="flex items-center justify-between border-b border-[var(--line-strong)] px-4 py-2.5 sm:px-6">
        <span className="mono-label text-[var(--red)]">Job / {statusLabel(job)}</span>
        <span className="font-mono text-[11px] text-[var(--ink-mute)]">{job.id.slice(0, 8).toUpperCase()}</span>
      </div>

      <div className="p-5 sm:p-6" id="job-panel">
        <div className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-[var(--ink)] bg-[var(--paper)] text-[var(--red)]">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="display line-clamp-1 text-xl text-[var(--ink)] sm:text-2xl">{job.title}</h2>
              <span className="badge badge-accent">{kindLabel(job.kind)}</span>
              <span className="badge">{rangeText(job)}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-[var(--ink-mute)]">
              {active ? <Loader2 className="h-3 w-3 animate-spin text-[var(--red)]" /> : null}
              <span>{stageLabel(job)}</span>
              {job.progress.detail && job.progress.detail !== stageLabel(job) ? (
                <>
                  <span>/</span>
                  <span className="truncate">{job.progress.detail}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-end justify-between">
            <span className="mono-label">Progress</span>
            <span className="font-mono text-2xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
              {percent === null ? "—" : `${Math.round(percent)}%`}
            </span>
          </div>

          <progress
            className="progress"
            max={100}
            value={percent === null ? undefined : Math.min(100, Math.max(0, percent))}
            aria-label="Download progress"
          />

          <div className="mt-3 grid grid-cols-2 border border-[var(--line-strong)] sm:grid-cols-4">
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
            <Stat label="Range" value={job.range ? `${formatClock(job.range.start)} – ${formatClock(job.range.end)}` : "Full video"} />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] leading-relaxed tracking-[0.04em] text-[var(--ink-mute)]">
            {job.kind === "mp3" ? "AUDIO DOWNLOAD + MP3 CONVERSION" : "VIDEO + AUDIO DOWNLOAD + MERGE"}
          </p>
          <ActionButton onClick={onCancel} disabled={cancelling} className="h-8 px-3">
            <X className="h-3.5 w-3.5" />
            {cancelling ? "Cancelling…" : "Cancel"}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

function Shell({ tone, children }: { tone: "green" | "red" | "neutral"; children: ReactNode }) {
  const border = tone === "green" ? "border-t-[var(--green)]" : tone === "red" ? "border-t-[var(--red)]" : "border-t-[var(--ink-mute)]";
  return <div className={cn("panel animate-fade-in border-t-4 p-5 sm:p-6", border)}>{children}</div>;
}

function Header({
  icon,
  tone,
  title,
  badges,
  children,
}: {
  icon: ReactNode;
  tone: "green" | "red" | "neutral";
  title: string;
  badges?: ReactNode;
  children?: ReactNode;
}) {
  const color = tone === "green" ? "border-[var(--green)] text-[var(--green)]" : tone === "red" ? "border-[var(--red)] text-[var(--red)]" : "border-[var(--ink-mute)] text-[var(--ink-mute)]";
  return (
    <div className="flex items-start gap-4">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center border bg-[var(--paper)]", color)}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="display text-2xl text-[var(--ink)]">{title}</h2>
          {badges}
        </div>
        {children}
      </div>
    </div>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex flex-col gap-2 sm:flex-row">{children}</div>;
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
      className={cn(primary ? "btn-primary h-11 flex-1 px-4" : "btn-secondary h-11 px-4", className)}
    >
      {children}
    </button>
  );
}

function Diagnostics({ text }: { text: string }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-mute)] transition hover:text-[var(--red)]">
        Show diagnostics
      </summary>
      <pre className="scrollbar-thin mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words border border-[var(--line)] bg-[var(--paper)] p-3 font-mono text-[11px] leading-relaxed text-[var(--ink-soft)]">
        {text}
      </pre>
    </details>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-r border-[var(--line)] px-3 py-2 last:border-r-0 sm:border-b-0">
      <div className="mono-label">{label}</div>
      <div className="mt-1 truncate font-mono text-[11px] text-[var(--ink)]">{value}</div>
    </div>
  );
}
