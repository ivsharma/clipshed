import { Router } from "express";
import { settingsUpdateSchema } from "@clipshed/shared";
import { getHealth } from "../services/binaries";
import { AppError } from "../services/errors";
import { getSettings, updateSettings } from "../services/settings";

export const settingsRouter = Router();

settingsRouter.get("/settings", async (_req, res) => {
  const [settings, health] = await Promise.all([getSettings(), getHealth()]);
  res.json({ settings, health });
});

settingsRouter.put("/settings", async (req, res) => {
  const parsed = settingsUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Invalid settings.",
    );
  }

  const settings = await updateSettings(parsed.data);
  const health = await getHealth();
  res.json({ settings, health });
});
