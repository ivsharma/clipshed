import { createApp } from "./app";
import { config, ensureDirs } from "./config";
import { log } from "./lib/logger";
import { getHealth } from "./services/binaries";
import { JobManager } from "./services/job-manager";

async function main(): Promise<void> {
  await ensureDirs();

  const manager = await JobManager.create();
  await manager.cleanup();

  const app = createApp(manager);

  const server = app.listen(config.port, config.host, () => {
    log.info(`Clipshed server listening at http://${config.host}:${config.port}`);

    void getHealth()
      .then((health) => {
        if (!health.binariesOk) {
          log.warn(
            "yt-dlp/ffmpeg aren't fully installed. Run `npm run setup` from the project root.",
          );
          return;
        }
        log.info(
          `yt-dlp ${health.ytdlpVersion ?? "unknown"} · ffmpeg ${health.ffmpegVersion ?? "unknown"} · Node ${health.nodeVersion}`,
        );
      })
      .catch((error) => log.warn("Could not check binary versions.", error));
  });

  const cleanupTimer = setInterval(() => {
    void manager.cleanup().catch((error) => {
      log.warn("Cleanup failed.", error);
    });
  }, 30 * 60 * 1000);
  cleanupTimer.unref();

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Received ${signal}; shutting down.`);

    await manager.shutdown().catch((error) => {
      log.warn("Could not cancel active jobs during shutdown.", error);
    });

    server.close(() => {
      process.exit(0);
    });

    setTimeout(() => {
      process.exit(0);
    }, 5000).unref();
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    log.error("Unhandled promise rejection.", reason);
  });

  process.on("uncaughtException", (error) => {
    log.error("Uncaught exception.", error);
  });
}

main().catch((error) => {
  log.error("Failed to start the server.", error);
  process.exit(1);
});
