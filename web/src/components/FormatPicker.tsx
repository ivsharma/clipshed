import {
  ChevronDown,
  FileAudio,
  FileVideo,
  Info,
  Layers,
  type LucideIcon,
} from "lucide-react";
import {
  formatBytes,
  type JobKind,
  type ProbeResult,
} from "@clipshed/shared";
import { cn } from "../lib/cn";

interface FormatPickerProps {
  video: ProbeResult;
  kind: JobKind;
  onKindChange: (kind: JobKind) => void;
  height: number | null;
  onHeightChange: (height: number) => void;
  bitrate: number;
  onBitrateChange: (bitrate: number) => void;
  estimatedVideoSize: number | null;
  estimatedAudioSize: number | null;
  selectedDuration: string;
}

interface FormatTab {
  id: JobKind;
  title: string;
  subtitle: string;
  icon: LucideIcon;
}

const TABS: FormatTab[] = [
  {
    id: "mp4",
    title: "MP4 video",
    subtitle: "Video + audio",
    icon: FileVideo,
  },
  {
    id: "mp3",
    title: "MP3 audio",
    subtitle: "Audio only",
    icon: FileAudio,
  },
  {
    id: "both",
    title: "Both",
    subtitle: "MP4 + MP3",
    icon: Layers,
  },
];

const BITRATES = [128, 192, 256, 320];

export function FormatPicker({
  video,
  kind,
  onKindChange,
  height,
  onHeightChange,
  bitrate,
  onBitrateChange,
  estimatedVideoSize,
  estimatedAudioSize,
  selectedDuration,
}: FormatPickerProps) {
  const selectedQuality =
    video.qualities.find((quality) => quality.height === height) ??
    video.qualities[0];

  const canVideo = video.qualities.length > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const selected = kind === tab.id;
          const disabled = tab.id !== "mp3" && !canVideo;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              disabled={disabled}
              onClick={() => onKindChange(tab.id)}
              className={cn(
                "group flex items-center gap-3 rounded-2xl border p-3.5 text-left transition",
                selected
                  ? "border-orange-400/35 bg-orange-400/[0.08] shadow-[0_0_0_1px_rgba(249,115,22,0.08)_inset]"
                  : "border-white/8 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]",
                disabled && "cursor-not-allowed opacity-45",
              )}
            >
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  selected
                    ? "bg-gradient-to-br from-red-500 to-orange-500 text-white"
                    : "bg-white/6 text-zinc-400",
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-zinc-100">
                  {tab.title}
                </span>
                <span className="block truncate text-[11px] text-zinc-500">
                  {disabled ? "No video stream" : tab.subtitle}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {kind !== "mp3" ? (
        <div className="space-y-2.5">
          {kind === "both" ? (
            <div className="flex items-center gap-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
              <FileVideo className="h-3.5 w-3.5 text-orange-400/70" />
              Video output
            </div>
          ) : null}

          <label
            className="block text-xs font-medium text-zinc-400"
            htmlFor="quality"
          >
            Quality
          </label>
          <div className="relative">
            <select
              id="quality"
              value={height ?? selectedQuality?.height ?? ""}
              onChange={(event) => onHeightChange(Number(event.target.value))}
              className="field h-12 appearance-none pl-4 pr-10 text-sm"
            >
              {video.qualities.map((quality) => (
                <option key={quality.height} value={quality.height}>
                  {quality.label} · {quality.codecs.join(" / ")}
                  {quality.approxSize
                    ? ` · ~${formatBytes(quality.approxSize)}`
                    : ""}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedQuality?.h264 ? (
              <span className="badge badge-success">
                H.264 · best compatibility
              </span>
            ) : (
              <span className="badge badge-accent">
                {selectedQuality?.codecs.join(" / ") ?? "Modern codec"}
              </span>
            )}
            {selectedQuality && selectedQuality.fps >= 50 ? (
              <span className="badge">
                {Math.round(selectedQuality.fps)} fps
              </span>
            ) : null}
            {estimatedVideoSize ? (
              <span className="badge badge-accent">
                ~{formatBytes(estimatedVideoSize)} video · {selectedDuration}
              </span>
            ) : null}
          </div>

          {selectedQuality && !selectedQuality.h264 ? (
            <p className="flex items-start gap-2 rounded-xl border border-amber-400/15 bg-amber-400/[0.05] px-3 py-2 text-[11px] leading-relaxed text-amber-200/70">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This quality uses VP9/AV1. It can be muxed into MP4, but older
              players may not play it. Pick 1080p or lower for H.264.
            </p>
          ) : null}
        </div>
      ) : null}

      {kind !== "mp4" ? (
        <div className="space-y-2.5">
          {kind === "both" ? (
            <>
              <div className="h-px bg-white/5" />
              <div className="flex items-center gap-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                <FileAudio className="h-3.5 w-3.5 text-orange-400/70" />
                Audio output
              </div>
            </>
          ) : null}

          <label
            className="block text-xs font-medium text-zinc-400"
            htmlFor="bitrate"
          >
            MP3 bitrate
          </label>
          <div className="relative">
            <select
              id="bitrate"
              value={bitrate}
              onChange={(event) => onBitrateChange(Number(event.target.value))}
              className="field h-12 appearance-none pl-4 pr-10 text-sm"
            >
              {BITRATES.map((value) => (
                <option key={value} value={value}>
                  {value} kbps {value === 192 ? "· recommended" : ""}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="badge">MP3 · 48 kHz</span>
            {estimatedAudioSize ? (
              <span className="badge badge-accent">
                ~{formatBytes(estimatedAudioSize)} audio · {selectedDuration}
              </span>
            ) : null}
          </div>

          <p className="flex items-start gap-2 rounded-xl border border-white/6 bg-white/[0.025] px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            YouTube audio is already compressed. 192 kbps is a good balance;
            320 kbps mostly increases file size.
          </p>
        </div>
      ) : null}

      {kind === "both" ? (
        <p className="flex items-start gap-2 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.045] px-3 py-2 text-[11px] leading-relaxed text-emerald-200/60">
          <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          One section download. The MP3 is extracted from the same source, so
          you get both files without downloading the range twice.
        </p>
      ) : null}
    </div>
  );
}
