import { ArrowRight, Loader2 } from "lucide-react";
import { formatBytes, type JobKind, type VideoQuality } from "@clipshed/shared";

interface SummaryPanelProps {
  kind: JobKind;
  quality: VideoQuality | null;
  bitrate: number;
  rangeLabel: string;
  estimatedBytes: number | null;
  actionLabel: string;
  canStart: boolean;
  starting: boolean;
  blockedReason: string | null;
  onStart: () => void;
}

const FORMAT_LABELS: Record<JobKind, string> = {
  mp4: "MP4 / video + audio",
  mp3: "MP3 / audio only",
  both: "MP4 + MP3 / one download",
};

export function SummaryPanel({
  kind,
  quality,
  bitrate,
  rangeLabel,
  estimatedBytes,
  actionLabel,
  canStart,
  starting,
  blockedReason,
  onStart,
}: SummaryPanelProps) {
  const qualityLabel =
    kind === "mp3" || !quality
      ? `${bitrate} kbps`
      : kind === "both"
        ? `${quality.label} + ${bitrate} kbps`
        : `${quality.label} / ${quality.codecs.join(" / ")}`;

  return (
    <aside className="panel flex flex-col p-5 sm:p-6">
      <div className="flex items-baseline justify-between border-b border-[var(--line-strong)] pb-3">
        <h2 className="mono-label text-[var(--ink)]">Export order</h2>
        <span className="font-mono text-[11px] text-[var(--ink-mute)]">NO. 001</span>
      </div>

      <dl className="mt-1">
        <SummaryRow label="Format" value={FORMAT_LABELS[kind]} />
        <SummaryRow label="Quality" value={qualityLabel} />
        <SummaryRow label="Range" value={rangeLabel} />
      </dl>

      <div className="mt-5 border border-[var(--line-strong)] bg-[var(--paper)] p-4">
        <div className="mono-label">Estimated output</div>
        <div className="mt-1 font-mono text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
          {estimatedBytes ? formatBytes(estimatedBytes) : "—"}
        </div>
        <div className="mt-1 text-[11px] text-[var(--ink-mute)]">Actual size depends on the source bitrate.</div>
      </div>

      <button
        type="button"
        onClick={onStart}
        disabled={!canStart}
        className="btn-primary mt-5 h-12 w-full px-4"
        title={blockedReason ?? undefined}
      >
        {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        {actionLabel}
      </button>

      {blockedReason ? (
        <p className="mt-2 border-l-2 border-l-[var(--red)] pl-2 font-mono text-[10px] leading-relaxed text-[var(--red)]">
          {blockedReason}
        </p>
      ) : null}

      <div className="mt-4 flex items-center justify-between">
        <span className="stamp">LOCAL ONLY</span>
        <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--ink-mute)]">NO UPLOADS</span>
      </div>

      <div className="mt-auto pt-6">
        <p className="border-t border-[var(--line)] pt-3 font-mono text-[10px] leading-relaxed tracking-[0.04em] text-[var(--ink-mute)]">
          ONLY THE SELECTED RANGE IS FETCHED.
          <br />
          NOTHING IS QUEUED UNTIL YOU PRESS DOWNLOAD.
        </p>
      </div>
    </aside>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-dashed border-[var(--line)] py-3">
      <dt className="mono-label shrink-0">{label}</dt>
      <dd className="max-w-[65%] text-right font-mono text-[11px] leading-relaxed text-[var(--ink-soft)]">{value}</dd>
    </div>
  );
}
