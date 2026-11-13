import { Clock, Download, Loader2, Shield, Zap } from "lucide-react";
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
  mp4: "MP4 · video + audio",
  mp3: "MP3 · audio only",
  both: "MP4 + MP3 · one download",
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
        ? `${quality.label} MP4 + ${bitrate} kbps MP3`
        : `${quality.label} · ${quality.codecs.join(" / ")}`;

  return (
    <aside className="panel flex flex-col p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Download className="h-4 w-4 text-orange-400" />
        <h2 className="text-sm font-semibold text-zinc-200">Download summary</h2>
      </div>

      <dl className="mt-5 space-y-3">
        <SummaryRow label="Format" value={FORMAT_LABELS[kind]} />
        <SummaryRow label="Quality" value={qualityLabel} />
        <SummaryRow label="Range" value={rangeLabel} />
        <SummaryRow label="Estimated size" value={estimatedBytes ? formatBytes(estimatedBytes) : "—"} />
      </dl>

      <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-orange-400/15 bg-orange-400/[0.05] px-3 py-2.5 text-[11px] leading-relaxed text-orange-200/65">
        <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Only the selected range is downloaded. No full-hour fetch when you pick a 5-minute clip.
      </div>

      <button
        type="button"
        onClick={onStart}
        disabled={!canStart}
        className="btn-primary mt-5 h-12 w-full px-5 text-sm"
        title={blockedReason ?? undefined}
      >
        {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {actionLabel}
      </button>

      <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-zinc-600">
        <Shield className="h-3 w-3" />
        Processed locally · files never uploaded
      </div>

      {kind !== "mp3" && quality && !quality.h264 ? (
        <p className="mt-3 text-center text-[10px] leading-relaxed text-amber-300/55">
          {quality.codecs.join(" / ")} selected. Use a 1080p or lower quality for the widest player support.
        </p>
      ) : null}

      <div className="mt-auto pt-5">
        <div className="flex items-center gap-2 text-[10px] text-zinc-600">
          <Clock className="h-3 w-3" />
          Nothing is queued until you press download.
        </div>
      </div>
    </aside>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-3 last:border-0 last:pb-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">{label}</dt>
      <dd className="max-w-[68%] text-right text-xs font-medium leading-relaxed text-zinc-300">{value}</dd>
    </div>
  );
}
