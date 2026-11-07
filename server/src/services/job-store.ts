import fs from "node:fs/promises";
import path from "node:path";
import type { Job } from "@clipshed/shared";
import { config } from "../config";
import { log } from "../lib/logger";

let writeChain: Promise<void> = Promise.resolve();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeJob(value: unknown): value is Job {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && typeof value.status === "string";
}

function normalizeLoadedJob(job: Job): Job {
  const normalized: Job = {
    ...job,
    audioOutput: job.audioOutput ?? null,
  };

  const active =
    normalized.status === "queued" ||
    normalized.status === "resolving" ||
    normalized.status === "running";

  if (!active) return normalized;

  return {
    ...normalized,
    status: "failed",
    stage: "done",
    error: {
      code: "INTERRUPTED",
      message: "The app restarted before this job finished.",
    },
    finishedAt: Date.now(),
  };
}

export async function loadJobs(): Promise<Job[]> {
  try {
    const raw = await fs.readFile(config.historyFile, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(looksLikeJob)
      .map(normalizeLoadedJob)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 100);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      log.warn("Could not read job history.", error);
    }
    return [];
  }
}

export function saveJobs(jobs: Job[]): Promise<void> {
  const snapshot = jobs.slice(0, 100);

  writeChain = writeChain
    .then(async () => {
      await fs.mkdir(path.dirname(config.historyFile), { recursive: true });
      const temp = `${config.historyFile}.tmp`;
      await fs.writeFile(temp, JSON.stringify(snapshot, null, 2), "utf8");
      await fs.rename(temp, config.historyFile);
    })
    .catch((error) => {
      log.error("Could not save job history.", error);
    });

  return writeChain;
}
