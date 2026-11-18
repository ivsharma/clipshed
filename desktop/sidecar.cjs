const fs = require("node:fs");
const path = require("node:path");

const serverBundle = fs.existsSync(path.join(__dirname, "server.cjs"))
  ? "./server.cjs"
  : "./build/server.cjs";
const { startLocalServer } = require(serverBundle);

async function main() {
  const running = await startLocalServer({
    host: process.env.HOST || "127.0.0.1",
    port: Number(process.env.PORT || 43123),
  });

  console.log(`CLIPSHED_READY http://${running.host}:${running.port}`);

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`CLIPSHED_SHUTDOWN ${signal}`);

    const forceExit = setTimeout(() => process.exit(0), 5000);
    forceExit.unref();

    try {
      await running.close();
    } catch (error) {
      console.error("CLIPSHED_SHUTDOWN_FAILED", error);
    }

    clearTimeout(forceExit);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => console.error("CLIPSHED_UNHANDLED_REJECTION", reason));
  process.on("uncaughtException", (error) => console.error("CLIPSHED_UNCAUGHT_EXCEPTION", error));
}

main().catch((error) => {
  console.error("CLIPSHED_SERVER_FAILED", error);
  process.exit(1);
});
