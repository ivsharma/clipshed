import { log } from "./lib/logger";
import { startLocalServer } from "./server";

async function main(): Promise<void> {
  const running = await startLocalServer();

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Received ${signal}; shutting down.`);

    const forceExit = setTimeout(() => process.exit(0), 5000);
    forceExit.unref();

    try {
      await running.close();
    } catch (error) {
      log.warn("Server shutdown failed.", error);
    }

    clearTimeout(forceExit);
    process.exit(0);
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
