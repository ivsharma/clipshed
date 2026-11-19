import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import {
  resolveMediaUrl,
  type Job,
  type JobEvent,
  type JobProgress,
  type JobRange,
  type JobRequest,
  type JobStage,
  type MediaSource,
  type ProbeResult,
} from "@clipshed/shared";
import { config } from "../config";
import { AppError } from "../errors";
import { buildOutputBase } from "../lib/filename";
import { log } from "../lib/logger";
import { chooseQuality } from "../media/formats";
import { getProbe } from "../media/probe";
import { startDownload, type DownloadHandle, type DownloadResult, type DownloadedFile } from "../media/download";
import { getSettings } from "./settings";

const TERMINAL = new Set<Job["status"]>(["completed", "failed", "cancelled"]);
const ACTIVE = new Set<Job["status"]>(["queued", "resolving", "running"]);
const HISTORY_LIMIT = 100;
const DEFAULT_BITRATE = 192;
const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isJobId = (value: string): boolean => JOB_ID_PATTERN.test(value);

type EventType = JobEvent["type"];

/** Validates a requested range against the real duration and returns it cleaned up. */
export function validateRange(range: JobRange | null, duration: number | null): JobRange | null {
  if (!range) {
    if (duration !== null && duration > config.maxVideoDurationSeconds) {
      throw new AppError("DURATION_TOO_LONG", "This video is longer than 6 hours. Use a custom range instead.");
    }
    return null;
  }

  if (duration === null) {
    throw new AppError("RANGE_UNAVAILABLE", "This video doesn't report a duration, so a time range can't be used.");
  }
  if (range.end - range.start < 1) throw new AppError("INVALID_RANGE", "Select at least one second.");
  if (range.start >= duration - 0.5) {
    throw new AppError("INVALID_RANGE", "The start time is at or past the end of the video.");
  }
  if (range.end > duration + 1) throw new AppError("INVALID_RANGE", "The end time is past the end of the video.");
  if (range.end - range.start > config.maxVideoDurationSeconds) {
    throw new AppError("DURATION_TOO_LONG", "That range is longer than 6 hours. Pick a shorter range.");
  }

  const start = Math.max(0, Math.round(range.start * 1000) / 1000);
  const end = Math.min(duration, Math.round(range.end * 1000) / 1000);
  if (end - start < 1) throw new AppError("INVALID_RANGE", "Select at least one second.");
  return { start, end };
}

const sourceOf = (job: Job): MediaSource => ({
  platform: job.platform,
  mediaId: job.mediaId,
  url: job.url,
  startAt: null,
});

/** Output file URL. `kind` is "mp4" or "mp3"; Both jobs expose two files. */
const fileUrl = (jobId: string, kind: "mp4" | "mp3"): string => `/api/jobs/${jobId}/file?kind=${kind}`;

const mimeFor = (kind: "mp4" | "mp3"): string => (kind === "mp3" ? "audio/mpeg" : "video/mp4");

function toJobOutput(jobId: string, file: DownloadedFile, kind: "mp4" | "mp3") {
  return {
    filename: file.filename,
    size: file.size,
    duration: file.duration,
    mime: file.mime,
    downloadUrl: fileUrl(jobId, kind),
  };
}

function initialProgress(): JobProgress {
  return { percent: null, downloadedBytes: 0, totalBytes: null, speed: null, eta: null, detail: "Queued" };
}

/** Removes UUID-named job directories under a trusted root. */
async function removeDirs(root: string, ...names: string[]): Promise<void> {
  await Promise.all(
    names.map((name) => {
      const safeName = path.basename(name);
      if (!isJobId(safeName)) return Promise.resolve();
      return fs.rm(path.join(root, safeName), { recursive: true, force: true }).catch(() => undefined);
    }),
  );
}

/** Old history files stored `videoId`; keep them readable and mark interrupted jobs. */
function normalizeLoaded(raw: Partial<Job> & { videoId?: string }): Job {
  const job: Job = {
    ...(raw as Job),
    platform: raw.platform ?? "youtube",
    mediaId: raw.mediaId ?? raw.videoId ?? "",
    audioOutput: raw.audioOutput ?? null,
  };

  if (!ACTIVE.has(job.status)) return job;
  return {
    ...job,
    status: "failed",
    stage: "done",
    error: { code: "INTERRUPTED", message: "The app restarted before this job finished." },
    finishedAt: Date.now(),
  };
}

async function loadHistory(): Promise<Job[]> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(config.historyFile, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Partial<Job> => typeof item === "object" && item !== null && "id" in item)
      .map(normalizeLoaded)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, HISTORY_LIMIT);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") log.warn("Could not read job history.", error);
    return [];
  }
}

let writeChain: Promise<void> = Promise.resolve();

function saveHistory(jobs: Job[]): Promise<void> {
  const snapshot = jobs.slice(0, HISTORY_LIMIT);
  writeChain = writeChain
    .then(async () => {
      await fs.mkdir(path.dirname(config.historyFile), { recursive: true });
      const temp = `${config.historyFile}.tmp`;
      await fs.writeFile(temp, JSON.stringify(snapshot, null, 2), "utf8");
      await fs.rename(temp, config.historyFile);
    })
    .catch((error) => log.error("Could not save job history.", error));
  return writeChain;
}

export class JobManager {
  private readonly jobs = new Map<string, Job>();
  private readonly queue: string[] = [];
  private readonly active = new Map<string, DownloadHandle>();
  private readonly cancelRequested = new Set<string>();
  private readonly events = new EventEmitter();

  private constructor() {
    this.events.setMaxListeners(50);
  }

  static async create(): Promise<JobManager> {
    const manager = new JobManager();
    for (const job of await loadHistory()) manager.jobs.set(job.id, job);
    return manager;
  }

  async createJob(request: JobRequest): Promise<Job> {
    const source = resolveMediaUrl(request.url);
    if (!source.ok) throw new AppError("INVALID_URL", source.error);

    const probe = await getProbe(source, await getSettings());
    if (probe.isLive) {
      throw new AppError("LIVE_UNSUPPORTED", "Active live streams aren't supported. Try again after the stream ends.");
    }

    const kind = request.kind;
    const quality = kind === "mp3" ? null : chooseQuality(probe, request.height ?? null);

    const job: Job = {
      id: randomUUID(),
      url: source.url,
      platform: source.platform,
      mediaId: source.mediaId,
      title: probe.title,
      uploader: probe.uploader,
      thumbnail: probe.thumbnail,
      duration: probe.duration,
      kind,
      height: quality?.height ?? null,
      bitrate: kind === "mp4" ? null : (request.bitrate ?? DEFAULT_BITRATE),
      range: validateRange(request.range ?? null, probe.duration),
      precise: Boolean(request.precise),
      status: "queued",
      stage: "queued",
      progress: initialProgress(),
      output: null,
      audioOutput: null,
      error: null,
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
    };

    this.jobs.set(job.id, job);
    this.queue.push(job.id);
    await this.persist();
    this.emit(job, "update");
    this.pump();

    return structuredClone(job);
  }

  getJob(id: string): Job | null {
    if (!isJobId(id)) return null;
    const job = this.jobs.get(id);
    return job ? structuredClone(job) : null;
  }

  listJobs(): Job[] {
    return [...this.jobs.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, HISTORY_LIMIT)
      .map((job) => structuredClone(job));
  }

  subscribe(id: string, listener: (event: JobEvent) => void): () => void {
    if (!isJobId(id) || !this.jobs.has(id)) {
      throw new AppError("JOB_NOT_FOUND", "That job doesn't exist.", 404);
    }
    const eventName = `job:${id}`;
    this.events.on(eventName, listener);
    return () => this.events.off(eventName, listener);
  }

  async cancelJob(id: string): Promise<Job> {
    const job = this.require(id);
    if (TERMINAL.has(job.status)) return structuredClone(job);

    this.cancelRequested.add(id);

    if (job.status === "queued") {
      const index = this.queue.indexOf(id);
      if (index >= 0) this.queue.splice(index, 1);
      await this.markCancelled(job);
    } else {
      job.stage = "cancelling";
      this.emit(job, "update");
      await this.active.get(id)?.cancel();
    }

    return structuredClone(job);
  }

  async deleteJob(id: string): Promise<void> {
    const job = this.require(id);
    if (!TERMINAL.has(job.status)) {
      throw new AppError("JOB_ACTIVE", "Cancel the job before deleting it.", 409);
    }
    this.jobs.delete(id);
    await this.persist();
    await removeDirs(config.tempDir, id);
    await removeDirs(config.downloadsDir, id);
  }

  /** Removes finished jobs past their TTL and any leftover folders. */
  async cleanup(): Promise<void> {
    const cutoff = Date.now() - config.jobTtlHours * 60 * 60 * 1000;

    for (const [id, job] of this.jobs) {
      if (!TERMINAL.has(job.status)) continue;
      await removeDirs(config.tempDir, id);
      if (job.finishedAt && job.finishedAt < cutoff) {
        this.jobs.delete(id);
        await removeDirs(config.downloadsDir, id);
      }
    }

    await this.removeStrayDirs(config.tempDir, (job) => TERMINAL.has(job.status));
    await this.removeStrayDirs(config.downloadsDir, () => false);
    await this.persist();
  }

  async shutdown(): Promise<void> {
    await Promise.allSettled([...this.active.values()].map((handle) => handle.cancel()));
    await this.persist();
  }

  /** Deletes folders for unknown jobs, plus folders for finished jobs when `shouldRemove` says so. */
  private async removeStrayDirs(root: string, shouldRemove: (job: Job) => boolean): Promise<void> {
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const job = this.jobs.get(entry.name);
      if (!job || shouldRemove(job)) await removeDirs(root, entry.name);
    }
  }

  private pump(): void {
    while (this.active.size < config.maxConcurrentJobs && this.queue.length > 0) {
      const id = this.queue.shift();
      const job = id ? this.jobs.get(id) : undefined;
      if (job?.status === "queued") void this.runJob(job);
    }
  }

  private async runJob(job: Job): Promise<void> {
    const id = job.id;
    try {
      if (this.cancelRequested.has(id)) return await this.markCancelled(job);

      this.setState(job, "resolving", "resolving", "Reading video");

      const settings = await getSettings();
      const probe = await getProbe(sourceOf(job), settings);
      if (this.cancelRequested.has(id)) return await this.markCancelled(job);
      if (probe.isLive) {
        throw new AppError("LIVE_UNSUPPORTED", "This stream went live and can't be downloaded until it ends.");
      }

      this.applyProbe(job, probe);
      const quality = job.kind === "mp3" ? null : chooseQuality(probe, job.height);
      job.height = quality?.height ?? null;

      const handle = await startDownload(
        {
          id,
          url: job.url,
          kind: job.kind,
          bitrate: job.bitrate,
          range: job.range,
          precise: job.precise,
          quality,
          base: buildOutputBase(job.title, job.range, job.mediaId),
        },
        settings,
        job.range ? Math.max(1, job.range.end - job.range.start) : probe.duration,
        {
          onProgress: (progress) => this.onProgress(id, progress),
          onStage: (stage) => this.onStage(id, stage),
        },
      );
      this.active.set(id, handle);

      this.setState(job, "running", "downloading", "Downloading");
      job.startedAt = Date.now();
      if (this.cancelRequested.has(id)) await handle.cancel();

      const result = await handle.promise;
      if (result.cancelled || this.cancelRequested.has(id)) return await this.markCancelled(job);
      await this.markCompleted(job, result);
    } catch (error) {
      if (this.cancelRequested.has(id)) return await this.markCancelled(job);
      this.markFailed(job, error);
      await this.persist();
    } finally {
      this.active.delete(id);
      this.cancelRequested.delete(id);
      this.pump();
    }
  }

  private applyProbe(job: Job, probe: ProbeResult): void {
    job.range = validateRange(job.range, probe.duration);
    job.title = probe.title;
    job.uploader = probe.uploader;
    job.thumbnail = probe.thumbnail;
    job.duration = probe.duration;
  }

  private async markCompleted(job: Job, result: Extract<DownloadResult, { cancelled: false }>): Promise<void> {
    job.status = "completed";
    job.stage = "done";
    job.progress = {
      percent: 100,
      downloadedBytes: result.video.size,
      totalBytes: result.video.size,
      speed: null,
      eta: 0,
      detail: "Done",
    };
    job.output = toJobOutput(job.id, result.video, job.kind === "mp3" ? "mp3" : "mp4");
    job.audioOutput = result.audio ? toJobOutput(job.id, result.audio, "mp3") : null;
    job.error = null;
    job.finishedAt = Date.now();

    this.emit(job, "done");
    await this.persist();
  }

  private markFailed(job: Job, error: unknown): void {
    const appError =
      error instanceof AppError
        ? error
        : new AppError("DOWNLOAD_FAILED", "The download failed.", 500, error instanceof Error ? error.message : String(error));

    job.status = "failed";
    job.stage = "done";
    job.error = { code: appError.code, message: appError.message, details: appError.details };
    job.finishedAt = Date.now();
    job.progress.detail = "Failed";

    log.error(`Job ${job.id} failed: ${appError.code}`, appError.details ?? appError.message);
    this.emit(job, "error");
  }

  private async markCancelled(job: Job): Promise<void> {
    if (TERMINAL.has(job.status)) return;
    job.status = "cancelled";
    job.stage = "done";
    job.progress.detail = "Cancelled";
    job.progress.eta = 0;
    job.finishedAt = Date.now();
    this.emit(job, "update");
    await this.persist();
    await removeDirs(config.tempDir, job.id);
    await removeDirs(config.downloadsDir, job.id);
  }

  private setState(job: Job, status: Job["status"], stage: JobStage, detail: string): void {
    job.status = status;
    job.stage = stage;
    job.progress.detail = detail;
    this.emit(job, "update");
  }

  private onProgress(id: string, progress: JobProgress): void {
    const job = this.jobs.get(id);
    if (job?.status !== "running") return;
    job.progress = progress;
    this.emit(job, "update");
  }

  private onStage(id: string, stage: JobStage): void {
    const job = this.jobs.get(id);
    if (job?.status !== "running") return;
    job.stage = stage;
    this.emit(job, "update");
  }

  private require(id: string): Job {
    const job = isJobId(id) ? this.jobs.get(id) : undefined;
    if (!job) throw new AppError("JOB_NOT_FOUND", "That job doesn't exist.", 404);
    return job;
  }

  private async persist(): Promise<void> {
    await saveHistory([...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt));
  }

  private emit(job: Job, type: EventType): void {
    this.events.emit(`job:${job.id}`, { type, job: structuredClone(job) } satisfies JobEvent);
  }
}
