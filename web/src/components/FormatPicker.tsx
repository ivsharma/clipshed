import { ChevronDown, FileAudio, FileVideo, Info, Layers, type LucideIcon } from "lucide-react";
import { formatBytes, type JobKind, type ProbeResult } from "@clipshed/shared";

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
  index: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
}

const TABS: FormatTab[] = [
  { id: "mp4", index: "01", title: "MP4", subtitle: "Video + audio", icon: FileVideo },
  { id: "mp3", index: "02", title: "MP3", subtitle: "Audio only", icon: FileAudio },
  { id: "both", index: "03", title: "Both", subtitle: "MP4 + MP3", icon: Layers },
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
  const selectedQuality = video.qualities.find((quality) => quality.height === height) ?? video.qualities[0];
  const canVideo = video.qualities.length > 0;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="mono-label">01 / Output</span>
        <span className="font-mono text-[11px] text-[var(--ink-mute)]">SELECT ONE</span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
              className={[
                "group flex items-start gap-3 border p-3 text-left transition",
                selected
                  ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper-raised)]"
                  : "border-[var(--line-strong)] bg-[var(--paper-raised)] text-[var(--ink)] hover:border-[var(--red)]",
                disabled ? "cursor-not-allowed opacity-40" : "",
              ].join(" ")}
            >
              <span
                className={[
                  "font-mono text-[11px] font-bold",
                  selected ? "text-[var(--red)]" : "text-[var(--red)]",
                ].join(" ")}
              >
                {tab.index}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <Icon className="h-3.5 w-3.5" />
                  {tab.title}
                </span>
                <span className={selected ? "mt-0.5 block text-[11px] text-[var(--format-muted)]" : "mt-0.5 block text-[11px] text-[var(--ink-mute)]"}>
                  {disabled ? "No video stream" : tab.subtitle}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 space-y-2">
        {kind !== "mp3" ? (
          <>
            {kind === "both" ? <div className="mono-label pt-1 text-[var(--red)]">Video output</div> : null}
            <div className="flex items-center justify-between">
              <label htmlFor="quality" className="mono-label">Quality</label>
              {estimatedVideoSize ? (
                <span className="font-mono text-[11px] text-[var(--ink-mute)]">
                  ~{formatBytes(estimatedVideoSize)} / {selectedDuration}
                </span>
              ) : null}
            </div>
            <div className="relative">
              <select
                id="quality"
                value={height ?? selectedQuality?.height ?? ""}
                onChange={(event) => onHeightChange(Number(event.target.value))}
                className="field h-11 appearance-none pl-3 pr-9 text-[13px]"
              >
                {video.qualities.map((quality) => (
                  <option key={quality.height} value={quality.height}>
                    {quality.label} · {quality.codecs.join(" / ")}
                    {quality.approxSize ? ` · ~${formatBytes(quality.approxSize)}` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-mute)]" />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {selectedQuality?.h264 ? (
                <span className="badge badge-success">H.264</span>
              ) : (
                <span className="badge badge-accent">{selectedQuality?.codecs.join(" / ") ?? "Modern codec"}</span>
              )}
              {selectedQuality && selectedQuality.fps >= 50 ? <span className="badge">{Math.round(selectedQuality.fps)} FPS</span> : null}
              {selectedQuality ? <span className="badge">{selectedQuality.label}</span> : null}
            </div>

            {selectedQuality && !selectedQuality.h264 ? (
              <p className="flex items-start gap-2 border-l-2 border-l-[var(--amber)] bg-[var(--paper)] px-3 py-2 text-[12px] leading-relaxed text-[var(--ink-soft)]">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                VP9/AV1 works in MP4, but older players may not. Choose 1080p or lower for H.264.
              </p>
            ) : null}
          </>
        ) : null}

        {kind !== "mp4" ? (
          <>
            <div className="h-px bg-[var(--line)]" />
            {kind === "both" ? <div className="mono-label pt-1 text-[var(--red)]">Audio output</div> : null}
            <div className="flex items-center justify-between">
              <label htmlFor="bitrate" className="mono-label">MP3 bitrate</label>
              {estimatedAudioSize ? (
                <span className="font-mono text-[11px] text-[var(--ink-mute)]">
                  ~{formatBytes(estimatedAudioSize)} / {selectedDuration}
                </span>
              ) : null}
            </div>
            <div className="relative">
              <select
                id="bitrate"
                value={bitrate}
                onChange={(event) => onBitrateChange(Number(event.target.value))}
                className="field h-11 appearance-none pl-3 pr-9 text-[13px]"
              >
                {BITRATES.map((value) => (
                  <option key={value} value={value}>
                    {value} kbps{value === 192 ? " · recommended" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-mute)]" />
            </div>

            <p className="flex items-start gap-2 border-l-2 border-l-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-[12px] leading-relaxed text-[var(--ink-mute)]">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              The source audio is already compressed. 192 kbps is a sensible default.
            </p>
          </>
        ) : null}
      </div>

      {kind === "both" ? (
        <p className="mt-4 flex items-start gap-2 border border-[var(--green)] px-3 py-2 text-[12px] leading-relaxed text-[var(--green)]">
          <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          One range download. The MP3 is extracted from the same source.
        </p>
      ) : null}
    </div>
  );
}
