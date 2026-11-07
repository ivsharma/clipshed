import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import {
  canonicalizeYouTubeUrl,
  type Job,
  type JobEvent,
  type JobProgress,
  type JobRange,
  type JobRequest,
  type JobStage,
  type ProbeResult,
  type Settings,
} from "@clipshed/shared";
import { config } from "../config";
import { buildOutputBase } from "../lib/filename";
import { log } from "../lib/logger";
import { AppError } from "./errors";
import { loadJobs, saveJobs } from "./job-store";
import { getVideoInfo } from "./probe-service";
import { getSettings } from "./settings";
import { startDownload, type DownloadHandle } from "./ytdlp";

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

function initialProgress(): JobProgress {
  return {
    percent: null,
    downloadedBytes: 0,
    totalBytes: null,
    speed: null,
    eta: null,
    detail: "Queued",
  };
}

export class JobManager {
  private readonly jobs = new Map<string, Job>();
  private readonly queue: string[] = [];
  private readonly active = new Map<string, DownloadHandle>();
  private readonly cancelRequested = new Set<string>();
  private readonly emitter = new EventEmitter();

  private constructor() {
    this.emitter.setMaxListeners(50);
  }

  static async create(): Promise<JobManager> {
    const manager = new JobManager();
    const history = await loadJobs();
    for (const job of history) manager.jobs.set(job.id, job);
    return manager;
  }

  async createJob(request: JobRequest): Promise<Job> {
    const canonical = canonicalizeYouTubeUrl(request.url);
    if (!canonical.ok) {
      throw new AppError("INVALID_URL", canonical.error);
    }

    const settings = await getSettings();
    const probe = await getVideoInfo(canonical.url, canonical.videoId, settings);

    if (probe.isLive) {
      throw new AppError(
        "LIVE_UNSUPPORTED",
        "Active live streams aren't supported. Try again after the stream ends.",
      );
    }

    const range = this.validateRange(request.range ?? null, probe.duration);
    const kind = request.kind;

    let height: number | null = null;
    let bitrate: number | null = null;

    if (kind !== "mp3") {
      height = this.chooseHeight(probe, request.height ?? null);
    }
    if (kind !== "mp4") {
      bitrate = request.bitrate ?? 192;
    }

    const job: Job = {
      id: randomUUID(),
      url: canonical.url,
      videoId: canonical.videoId,
      title: probe.title,
      uploader: probe.uploader,
      thumbnail: probe.thumbnail,
      duration: probe.duration,
      kind,
      height,
      bitrate,
      range,
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
    this.emitJob(job, "update");
    this.pump();

    return this.snapshot(job);
  }

  getJob(id: string): Job | null {
    const job = this.jobs.get(id);
    return job ? this.snapshot(job) : null;
  }

  listJobs(): Job[] {
    return [...this.jobs.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
      .map((job) => this.snapshot(job));
  }

  subscribe(id: string, listener: (event: JobEvent) => void): () => void {
    if (!this.jobs.has(id)) {
      throw new AppError("JOB_NOT_FOUND", "That job doesn't exist.", 404);
    }

    const eventName = `job:${id}`;
    this.emitter.on(eventName, listener);
    return () => this.emitter.off(eventName, listener);
  }

  async cancelJob(id: string): Promise<Job> {
    const job = this.jobs.get(id);
    if (!job) throw new AppError("JOB_NOT_FOUND", "That job doesn't exist.", 404);

    if (TERMINAL_STATUSES.has(job.status)) {
      return this.snapshot(job);
    }

    this.cancelRequested.add(id);

    if (job.status === "queued") {
      const index = this.queue.indexOf(id);
      if (index >= 0) this.queue.splice(index, 1);
      await this.markCancelled(job);
      return this.snapshot(job);
    }

    if (job.status === "resolving") {
      job.stage = "cancelling";
      this.emitJob(job, "update");
      return this.snapshot(job);
    }

    job.stage = "cancelling";
    this.emitJob(job, "update");

    const handle = this.active.get(id);
    if (handle) await handle.cancel();

    return this.snapshot(job);
  }

  async deleteJob(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) throw new AppError("JOB_NOT_FOUND", "That job doesn't exist.", 404);

    if (!TERMINAL_STATUSES.has(job.status)) {
      throw new AppError(
        "JOB_ACTIVE",
        "Cancel the job before deleting it.",
        409,
      );
    }

    this.jobs.delete(id);
    await this.persist();
    await this.removeJobDirs(id);
  }

  async cleanup(): Promise<void> {
    const cutoff = Date.now() - config.jobTtlHours * 60 * 60 * 1000;

    for (const [id, job] of this.jobs) {
      if (!TERMINAL_STATUSES.has(job.status)) continue;

      await fs.rm(path.join(config.tempDir, id), {
        recursive: true,
        force: true,
      }).catch(() => undefined);

      if (job.finishedAt && job.finishedAt < cutoff) {
        this.jobs.delete(id);
        await fs.rm(path.join(config.downloadsDir, id), {
          recursive: true,
          force: true,
        }).catch(() => undefined);
      }
    }

    await this.removeOrphanDirs(config.tempDir, true);
    await this.removeOrphanDirs(config.downloadsDir, false);
    await this.persist();
  }

  async shutdown(): Promise<void> {
    const handles = [...this.active.values()];
    await Promise.allSettled(handles.map((handle) => handle.cancel()));
    await this.persist();
  }

  private async removeOrphanDirs(root: string, tempOnly: boolean): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const job = this.jobs.get(entry.name);
      if (!job) {
        await fs.rm(path.join(root, entry.name), {
          recursive: true,
          force: true,
        }).catch(() => undefined);
        continue;
      }

      if (tempOnly && TERMINAL_STATUSES.has(job.status)) {
        await fs.rm(path.join(root, entry.name), {
          recursive: true,
          force: true,
        }).catch(() => undefined);
      }
    }
  }

  private pump(): void {
    while (
      this.active.size < config.maxConcurrentJobs &&
      this.queue.length > 0
    ) {
      const id = this.queue.shift();
      if (!id) break;

      const job = this.jobs.get(id);
      if (!job || job.status !== "queued") continue;

      void this.runJob(id);
    }
  }

  private async runJob(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;

    if (this.cancelRequested.has(id)) {
      await this.markCancelled(job);
      return;
    }

    job.status = "resolving";
    job.stage = "resolving";
    job.progress.detail = "Reading video";
    this.emitJob(job, "update");

    let tempDir = path.join(config.tempDir, id);

    try {
      const settings = await getSettings();
      const probe = await getVideoInfo(job.url, job.videoId, settings);

      if (this.cancelRequested.has(id)) {
        await this.markCancelled(job);
        return;
      }

      if (probe.isLive) {
        throw new AppError(
          "LIVE_UNSUPPORTED",
          "This stream went live and can't be downloaded until it ends.",
        );
      }

      const range = this.validateRange(job.range, probe.duration);
      job.range = range;
      job.duration = probe.duration;
      job.title = probe.title;
      job.uploader = probe.uploader;
      job.thumbnail = probe.thumbnail;

      if (job.kind !== "mp3") {
        job.height = this.chooseHeight(probe, job.height);
      }

      tempDir = path.join(config.tempDir, id);
      await fs.mkdir(tempDir, { recursive: true });

      const base = buildOutputBase(job.title, job.range, job.videoId);

      const handle = await startDownload(
        {
          id: job.id,
          url: job.url,
          kind: job.kind,
          height: job.height,
          bitrate: job.bitrate,
          range: job.range,
          precise: job.precise,
        },
        probe,
        settings,
        tempDir,
        base,
        {
          onProgress: (progress) => this.handleProgress(id, progress),
          onStage: (stage) => this.handleStage(id, stage),
        },
      );

      this.active.set(id, handle);

      job.status = "running";
      job.stage = "downloading";
      job.startedAt = Date.now();
      job.progress.detail = "Downloading";
      this.emitJob(job, "update");

      if (this.cancelRequested.has(id)) {
        await handle.cancel();
      }

      const result = await handle.promise;

      if (result.cancelled || this.cancelRequested.has(id)) {
        await this.markCancelled(job);
        return;
      }

      job.status = "completed";
      job.stage = "done";
      job.progress = {
        percent: 100,
        downloadedBytes: result.size ?? job.progress.downloadedBytes,
        totalBytes: result.size ?? job.progress.totalBytes,
        speed: null,
        eta: 0,
        detail: "Done",
      };
      job.output = {
        filename: result.filename ?? "download",
        size: result.size ?? 0,
        duration: result.duration ?? null,
        mime: result.mime ?? "application/octet-stream",
        downloadUrl:
          job.kind === "both"
            ? `/api/jobs/${job.id}/file?kind=mp4`
            : `/api/jobs/${job.id}/file`,
      };
      job.audioOutput = result.audio
        ? {
            filename: result.audio.filename,
            size: result.audio.size,
            duration: result.audio.duration,
            mime: result.audio.mime,
            downloadUrl: `/api/jobs/${job.id}/file?kind=mp3`,
          }
        : null;
      job.error = null;
      job.finishedAt = Date.now();

      this.emitJob(job, "done");
      await this.persist();
    } catch (error) {
      if (this.cancelRequested.has(id)) {
        await this.markCancelled(job);
        return;
      }

      const appError =
        error instanceof AppError
          ? error
          : new AppError(
              "DOWNLOAD_FAILED",
              "The download failed.",
              500,
              error instanceof Error ? error.message : String(error),
            );

      job.status = "failed";
      job.stage = "done";
      job.error = {
        code: appError.code,
        message: appError.message,
        details: appError.details,
      };
      job.finishedAt = Date.now();
      job.progress.detail = "Failed";

      log.error(`Job ${id} failed: ${appError.code}`, appError.details ?? appError.message);
      this.emitJob(job, "error");
      await this.persist();
      await this.removeJobDirs(id);
    } finally {
      this.active.delete(id);
      this.cancelRequested.delete(id);
      this.pump();
    }
  }

  private handleProgress(id: string, progress: JobProgress): void {
    const job = this.jobs.get(id);
    if (!job || job.status !== "running") return;
    job.progress = progress;
    this.emitJob(job, "update");
  }

  private handleStage(id: string, stage: JobStage): void {
    const job = this.jobs.get(id);
    if (!job || job.status !== "running") return;
    job.stage = stage;
    this.emitJob(job, "update");
  }

  private validateRange(
    range: JobRange | null,
    duration: number | null,
  ): JobRange | null {
    if (!range) {
      if (
        duration !== null &&
        duration > config.maxVideoDurationSeconds
      ) {
        throw new AppError(
          "DURATION_TOO_LONG",
          "This video is longer than 6 hours. Use a custom range instead of downloading the whole video.",
        );
      }
      return null;
    }

    if (duration === null) {
      throw new AppError(
        "RANGE_UNAVAILABLE",
        "This video doesn't report a duration, so a time range can't be used.",
      );
    }

    if (range.end - range.start < 1) {
      throw new AppError("INVALID_RANGE", "Select at least one second.");
    }

    if (range.start >= duration - 0.5) {
      throw new AppError(
        "INVALID_RANGE",
        "The start time is at or past the end of the video.",
      );
    }

    if (range.end > duration + 1) {
      throw new AppError(
        "INVALID_RANGE",
        "The end time is past the end of the video.",
      );
    }

    if (range.end - range.start > config.maxVideoDurationSeconds) {
      throw new AppError(
        "DURATION_TOO_LONG",
        "That range is longer than 6 hours. Pick a shorter range.",
      );
    }

    const start = Math.max(0, Math.round(range.start * 1000) / 1000);
    const end = Math.min(duration, Math.round(range.end * 1000) / 1000);

    if (end - start < 1) {
      throw new AppError("INVALID_RANGE", "Select at least one second.");
    }

    return { start, end };
  }

  private chooseHeight(probe: ProbeResult, requested: number | null): number {
    if (probe.qualities.length === 0) {
      throw new AppError(
        "NO_VIDEO_FORMAT",
        "This video doesn't have a downloadable video stream. Try MP3 instead.",
        422,
      );
    }

    const target =
      requested ??
      (probe.qualities.find((quality) => quality.height <= 1080)?.height ??
        probe.qualities[0].height);

    const atOrBelow = probe.qualities.filter(
      (quality) => quality.height <= target,
    );

    return (atOrBelow[0] ?? probe.qualities[probe.qualities.length - 1]).height;
  }

  private async markCancelled(job: Job): Promise<void> {
    if (TERMINAL_STATUSES.has(job.status)) return;

    job.status = "cancelled";
    job.stage = "done";
    job.progress.detail = "Cancelled";
    job.progress.eta = 0;
    job.finishedAt = Date.now();
    this.emitJob(job, "update");
    await this.persist();
    await this.removeJobDirs(job.id);
  }

  private async removeJobDirs(id: string): Promise<void> {
    await fs.rm(path.join(config.tempDir, id), {
      recursive: true,
      force: true,
    }).catch(() => undefined);
    await fs.rm(path.join(config.downloadsDir, id), {
      recursive: true,
      force: true,
    }).catch(() => undefined);
  }

  private async persist(): Promise<void> {
    const jobs = [...this.jobs.values()].sort(
      (a, b) => b.createdAt - a.createdAt,
    );
    await saveJobs(jobs);
  }

  private snapshot(job: Job): Job {
    return structuredClone(job);
  }

  private emitJob(
    job: Job,
    type: "snapshot" | "update" | "done" | "error",
  ): void {
    this.emitter.emit(`job:${job.id}`, {
      type,
      job: this.snapshot(job),
    } satisfies JobEvent);
  }
}
