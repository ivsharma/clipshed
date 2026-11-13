import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import type { ZodType } from "zod";
import {
  jobRequestSchema,
  probeRequestSchema,
  resolveMediaUrl,
  settingsUpdateSchema,
  type JobEvent,
} from "@clipshed/shared";
import { config } from "./config";
import { AppError } from "./errors";
import { isPathInside } from "./lib/filename";
import { getProbe } from "./media/probe";
import { getHealth, updateYtDlp } from "./services/binaries";
import type { JobManager } from "./services/job-manager";
import { getSettings, updateSettings } from "./services/settings";

function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid request.");
  }
  return parsed.data;
}

export function apiRouter(manager: JobManager): Router {
  const api = Router();

  api.get("/health", async (_req, res) => {
    res.json(await getHealth());
  });

  api.post("/ytdlp/update", async (_req, res) => {
    const result = await updateYtDlp();
    res.json({ ...result, health: await getHealth() });
  });

  api.post("/probe", async (req, res) => {
    const { url } = parseBody(probeRequestSchema, req.body);
    const source = resolveMediaUrl(url);
    if (!source.ok) throw new AppError("INVALID_URL", source.error);

    const probe = await getProbe(source, await getSettings());
    res.json({ ...probe, suggestedStart: source.startAt });
  });

  api.get("/settings", async (_req, res) => {
    res.json({ settings: await getSettings(), health: await getHealth() });
  });

  api.put("/settings", async (req, res) => {
    const settings = await updateSettings(parseBody(settingsUpdateSchema, req.body));
    res.json({ settings, health: await getHealth() });
  });

  api.post("/jobs", async (req, res) => {
    res.status(201).json(await manager.createJob(parseBody(jobRequestSchema, req.body)));
  });

  api.get("/jobs", (_req, res) => {
    res.json({ jobs: manager.listJobs() });
  });

  api.get("/jobs/:id", (req, res) => {
    const job = manager.getJob(req.params.id);
    if (!job) throw new AppError("JOB_NOT_FOUND", "That job doesn't exist.", 404);
    res.json(job);
  });

  api.get("/jobs/:id/events", (req, res) => {
    const id = req.params.id;
    const snapshot = manager.getJob(id);
    if (!snapshot) throw new AppError("JOB_NOT_FOUND", "That job doesn't exist.", 404);

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let closed = false;
    const send = (event: JobEvent): void => {
      if (!closed) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    send({ type: "snapshot", job: snapshot });
    const unsubscribe = manager.subscribe(id, send);
    const heartbeat = setInterval(() => {
      if (!closed) res.write(": ping\n\n");
    }, 15_000);

    req.on("close", () => {
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  });

  api.post("/jobs/:id/cancel", async (req, res) => {
    res.json(await manager.cancelJob(req.params.id));
  });

  api.get("/jobs/:id/file", async (req, res) => {
    const job = manager.getJob(req.params.id);
    if (!job || job.status !== "completed") {
      throw new AppError("FILE_NOT_READY", "That file isn't ready or no longer exists.", 404);
    }

    const mime = req.query.kind === "mp3" ? "audio/mpeg" : "video/mp4";
    const output = [job.output, job.audioOutput].find((candidate) => candidate?.mime === mime);
    if (!output) throw new AppError("FILE_NOT_READY", "That output isn't available for this job.", 404);

    const jobDir = path.resolve(config.downloadsDir, job.id);
    const filePath = path.resolve(jobDir, output.filename);
    if (!isPathInside(jobDir, filePath)) throw new AppError("INVALID_FILE", "Invalid file path.", 400);

    try {
      await fs.access(filePath);
    } catch {
      throw new AppError("FILE_MISSING", "The file has been cleaned up or deleted.", 410);
    }

    res.setHeader("Cache-Control", "no-store");
    res.download(filePath, output.filename);
  });

  api.delete("/jobs/:id", async (req, res) => {
    await manager.deleteJob(req.params.id);
    res.status(204).end();
  });

  return api;
}
