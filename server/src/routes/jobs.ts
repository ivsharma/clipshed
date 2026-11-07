import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { jobRequestSchema, type JobEvent } from "@clipshed/shared";
import { config } from "../config";
import { isPathInside } from "../lib/filename";
import { AppError } from "../services/errors";
import type { JobManager } from "../services/job-manager";

export function jobsRouter(manager: JobManager): Router {
  const router = Router();

  router.post("/jobs", async (req, res) => {
    const parsed = jobRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        "VALIDATION",
        parsed.error.issues[0]?.message ?? "Invalid download request.",
      );
    }

    const job = await manager.createJob(parsed.data);
    res.status(201).json(job);
  });

  router.get("/jobs", (_req, res) => {
    res.json({ jobs: manager.listJobs() });
  });

  router.get("/jobs/:id", (req, res) => {
    const job = manager.getJob(req.params.id);
    if (!job) throw new AppError("JOB_NOT_FOUND", "That job doesn't exist.", 404);
    res.json(job);
  });

  router.get("/jobs/:id/events", (req, res) => {
    const id = req.params.id;
    const job = manager.getJob(id);
    if (!job) throw new AppError("JOB_NOT_FOUND", "That job doesn't exist.", 404);

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let closed = false;
    const send = (event: JobEvent): void => {
      if (closed) return;
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        closed = true;
      }
    };

    send({ type: "snapshot", job });

    const unsubscribe = manager.subscribe(id, send);
    const heartbeat = setInterval(() => {
      if (!closed) res.write(": ping\n\n");
    }, 15_000);
    heartbeat.unref?.();

    req.on("close", () => {
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  });

  router.post("/jobs/:id/cancel", async (req, res) => {
    const job = await manager.cancelJob(req.params.id);
    res.json(job);
  });

  router.get("/jobs/:id/file", async (req, res) => {
    const id = req.params.id;
    const job = manager.getJob(id);
    if (!job || job.status !== "completed") {
      throw new AppError(
        "FILE_NOT_READY",
        "That file isn't ready or no longer exists.",
        404,
      );
    }

    const requestedKind = req.query.kind === "mp3" ? "mp3" : "mp4";
    const output =
      requestedKind === "mp3"
        ? job.kind === "mp3"
          ? job.output
          : job.audioOutput
        : job.kind === "mp3"
          ? null
          : job.output;

    if (!output) {
      throw new AppError(
        "FILE_NOT_READY",
        "That output isn't available for this job.",
        404,
      );
    }

    const jobDir = path.resolve(config.downloadsDir, id);
    const filePath = path.resolve(jobDir, output.filename);

    if (!isPathInside(jobDir, filePath)) {
      throw new AppError("INVALID_FILE", "Invalid file path.", 400);
    }

    try {
      await fs.access(filePath);
    } catch {
      throw new AppError(
        "FILE_MISSING",
        "The file has been cleaned up or deleted.",
        410,
      );
    }

    res.setHeader("Cache-Control", "no-store");
    res.download(filePath, output.filename, (error) => {
      if (error && !res.headersSent) {
        res.status(500).end();
      }
    });
  });

  router.delete("/jobs/:id", async (req, res) => {
    await manager.deleteJob(req.params.id);
    res.status(204).end();
  });

  return router;
}
