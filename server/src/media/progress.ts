import type { JobProgress, JobStage } from "@clipshed/shared";
import { stripAnsi } from "../errors";

const STAGE_LABELS: Partial<Record<JobStage, string>> = {
  downloading_video: "Downloading video",
  downloading_audio: "Downloading audio",
  downloading: "Downloading",
  merging: "Merging audio and video",
  converting: "Converting to MP3",
  finalizing: "Finalizing",
  cancelling: "Cancelling",
  resolving: "Reading video",
  queued: "Queued",
  done: "Done",
};

const EMIT_INTERVAL_MS = 250;

const toNumber = (value: string | undefined): number | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "NA" || trimmed === "None") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Turns yt-dlp and ffmpeg output into job progress. yt-dlp reports bytes per
 * stream on stdout; ffmpeg reports time position on stderr for section cuts.
 */
export class ProgressTracker {
  private readonly progress: JobProgress = {
    percent: 0,
    downloadedBytes: 0,
    totalBytes: null,
    speed: null,
    eta: null,
    detail: "Starting…",
  };
  private stage: JobStage = "downloading";
  private frozen = false;
  private usingFfmpeg = false;
  private ffmpegSeconds = 0;
  private ffmpegSpeed: number | null = null;
  private lastEmit = 0;

  constructor(
    private readonly sectionSeconds: number | null,
    private readonly onProgress: (progress: JobProgress) => void,
    private readonly onStage: (stage: JobStage) => void,
  ) {}

  /** Stops emitting. Used once cancellation has started. */
  freeze(): void {
    this.frozen = true;
  }

  setStage(stage: JobStage): void {
    if (this.frozen || this.stage === stage) return;
    this.stage = stage;
    this.progress.detail = STAGE_LABELS[stage] ?? "Working";
    this.onStage(stage);
    this.emit(true);
  }

  /** Shows a message while work runs without a measurable percentage. */
  indeterminate(detail: string): void {
    this.progress.percent = null;
    this.progress.speed = null;
    this.progress.eta = null;
    this.progress.detail = detail;
    this.emit(true);
  }

  complete(detail: string): void {
    this.progress.percent = 100;
    this.progress.eta = 0;
    this.progress.detail = detail;
    this.emit(true);
  }

  snapshot(): JobProgress {
    return { ...this.progress };
  }

  onStdoutLine(rawLine: string): void {
    const line = stripAnsi(rawLine).trim();
    if (line.startsWith("PROGRESS|")) this.handleYtDlpProgress(line.split("|"));
    else if (line.startsWith("POSTPROCESS|")) this.handlePostprocess(line.split("|"));
    else if (line.startsWith("[ExtractAudio]")) this.setStage("converting");
    else if (line.startsWith("[Merger]")) this.setStage("merging");
    else if (line.startsWith("[download] Destination:")) this.emit();
  }

  onStderrLine(rawLine: string): void {
    const line = stripAnsi(rawLine);

    const time = /^out_time_us=(\d+)/.exec(line);
    if (time) {
      this.usingFfmpeg = true;
      this.ffmpegSeconds = Number(time[1]) / 1_000_000;
      if (this.sectionSeconds) {
        this.progress.percent = Math.min(100, (this.ffmpegSeconds / this.sectionSeconds) * 100);
      }
      this.progress.eta = this.estimateEta();
      this.progress.detail = this.rangeDetail();
      this.emit();
      return;
    }

    const size = /^(?:total_)?size=\s*(\d+)\s*(KiB)?/.exec(line);
    if (size) {
      this.progress.downloadedBytes = Number(size[1]) * (size[2] ? 1024 : 1);
      this.emit();
      return;
    }

    const speed = /^speed=\s*([\d.]+)x/.exec(line);
    if (speed) {
      this.ffmpegSpeed = Number(speed[1]);
      this.progress.eta = this.estimateEta();
      this.progress.detail = this.rangeDetail();
      this.emit();
      return;
    }

    if (line.startsWith("progress=end")) this.complete(this.progress.detail ?? "Done");
  }

  private handleYtDlpProgress(parts: string[]): void {
    const [, status, downloaded, total, estimate, speed, eta, formatId, vcodec, acodec] = parts;
    const totalBytes = toNumber(total) ?? toNumber(estimate);
    const bytes = toNumber(downloaded) ?? 0;

    this.progress.downloadedBytes = bytes;
    this.progress.totalBytes = totalBytes;
    this.progress.speed = toNumber(speed) ?? this.progress.speed;
    this.progress.eta = toNumber(eta) ?? this.progress.eta;

    if (!this.usingFfmpeg && totalBytes && totalBytes > 0) {
      this.progress.percent = Math.min(100, (bytes / totalBytes) * 100);
    }

    if (status === "finished") {
      this.progress.eta = 0;
      if (!this.usingFfmpeg) this.progress.percent = 100;
    }

    if (!this.usingFfmpeg) {
      const hasVideo = Boolean(vcodec && vcodec !== "none");
      const hasAudio = Boolean(acodec && acodec !== "none");
      if (hasVideo && !hasAudio) this.setStage("downloading_video");
      else if (hasAudio && !hasVideo) this.setStage("downloading_audio");
      else this.setStage("downloading");
    }

    const label = STAGE_LABELS[this.stage] ?? "Working";
    this.progress.detail = formatId && formatId !== "NA" ? `${label} · ${formatId}` : label;
    this.emit();
  }

  private handlePostprocess(parts: string[]): void {
    const [, status, processor = ""] = parts;
    if (status !== "started") return;

    if (processor.includes("ExtractAudio")) this.setStage("converting");
    else if (processor.includes("Merger")) this.setStage("merging");
    else if (processor.includes("MoveFiles") || processor.includes("Fixup")) this.setStage("finalizing");
  }

  private estimateEta(): number | null {
    if (!this.ffmpegSpeed || !this.sectionSeconds) return null;
    return Math.max(0, this.sectionSeconds - this.ffmpegSeconds) / this.ffmpegSpeed;
  }

  private rangeDetail(): string {
    return this.ffmpegSpeed
      ? `Downloading selected range · ${this.ffmpegSpeed.toFixed(1)}× realtime`
      : "Downloading selected range";
  }

  private emit(force = false): void {
    if (this.frozen) return;
    const now = Date.now();
    if (!force && now - this.lastEmit < EMIT_INTERVAL_MS) return;
    this.lastEmit = now;
    this.onProgress(this.snapshot());
  }
}
