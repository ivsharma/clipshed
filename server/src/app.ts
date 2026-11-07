import { existsSync } from "node:fs";
import path from "node:path";
import express, {
  type ErrorRequestHandler,
  type Express,
} from "express";
import { config } from "./config";
import { log } from "./lib/logger";
import { AppError } from "./services/errors";
import type { JobManager } from "./services/job-manager";
import { healthRouter } from "./routes/health";
import { jobsRouter } from "./routes/jobs";
import { probeRouter } from "./routes/probe";
import { settingsRouter } from "./routes/settings";

export function createApp(manager: JobManager): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.use("/api", healthRouter);
  app.use("/api", probeRouter);
  app.use("/api", settingsRouter);
  app.use("/api", jobsRouter(manager));

  app.use("/api", (_req, res) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "API route not found.",
      },
    });
  });

  app.use(express.static(config.webDist, { index: false, fallthrough: true }));

  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) {
      next();
      return;
    }

    const indexPath = path.join(config.webDist, "index.html");
    if (!existsSync(indexPath)) {
      res
        .status(404)
        .type("text")
        .send("Frontend isn't built yet. Run `npm run dev` or `npm run build`.");
      return;
    }

    res.sendFile(indexPath, (error) => {
      if (error) next(error);
    });
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (res.headersSent) return;

    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      });
      return;
    }

    if (error instanceof SyntaxError && "body" in error) {
      res.status(400).json({
        error: {
          code: "INVALID_JSON",
          message: "The request body wasn't valid JSON.",
        },
      });
      return;
    }

    log.error("Unhandled API error.", error);
    res.status(500).json({
      error: {
        code: "INTERNAL",
        message: "Something went wrong on the server.",
      },
    });
  };

  app.use(errorHandler);

  return app;
}
