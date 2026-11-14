import type { Server } from "node:http";
import { createApp } from "./app";
import { config, ensureDirs } from "./config";
import { log } from "./lib/logger";
import { getHealth } from "./services/binaries";
import { JobManager } from "./services/job-manager";

export interface LocalServer {
  host: string;
  port: number;
  close: () => Promise<void>;
}

interface StartOptions {
  host?: string;
  port?: number;
}

/**
 * Starts the API and built UI on a local port. Used by the CLI entrypoint and
 * by the desktop shell, which asks for port 0 and loads the assigned URL.
 */
export async function startLocalServer(options: StartOptions = {}): Promise<LocalServer> {
  await ensureDirs();

  const manager = await JobManager.create();
  await manager.cleanup();

  const app = createApp(manager);
  const host = options.host ?? config.host;
  const requestedPort = options.port ?? config.port;

  const server = await new Promise<Server>((resolve, reject) => {
    const listening = app.listen(requestedPort, host, () => resolve(listening));
    listening.once("error", reject);
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : requestedPort;

  log.info(`Clipshed server listening at http://${host}:${port}`);

  void getHealth()
    .then((health) => {
      if (!health.binariesOk) {
        log.warn("yt-dlp/ffmpeg aren't fully installed. Run the setup script or reinstall Clipshed.");
        return;
      }
      log.info(
        `Clipshed ${health.appVersion} · yt-dlp ${health.ytdlpVersion ?? "unknown"} · ffmpeg ${health.ffmpegVersion ?? "unknown"} · Node ${health.nodeVersion}`,
      );
    })
    .catch((error) => log.warn("Could not check binary versions.", error));

  const cleanupTimer = setInterval(() => {
    void manager.cleanup().catch((error) => {
      log.warn("Cleanup failed.", error);
    });
  }, 30 * 60 * 1000);
  cleanupTimer.unref();

  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    clearInterval(cleanupTimer);

    await manager.shutdown().catch((error) => {
      log.warn("Could not cancel active jobs during shutdown.", error);
    });

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  };

  return { host, port, close };
}
