import { Router } from "express";
import {
  canonicalizeYouTubeUrl,
  probeRequestSchema,
} from "@clipshed/shared";
import { AppError } from "../services/errors";
import { getVideoInfo } from "../services/probe-service";
import { getSettings } from "../services/settings";

export const probeRouter = Router();

probeRouter.post("/probe", async (req, res) => {
  const parsed = probeRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Paste a valid YouTube link.",
    );
  }

  const canonical = canonicalizeYouTubeUrl(parsed.data.url);
  if (!canonical.ok) {
    throw new AppError("INVALID_URL", canonical.error);
  }

  const settings = await getSettings();
  const video = await getVideoInfo(
    canonical.url,
    canonical.videoId,
    settings,
  );

  res.json({
    ...video,
    suggestedStart: canonical.startAt,
  });
});
