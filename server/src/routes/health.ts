import { Router } from "express";
import { getHealth, updateYtDlp } from "../services/binaries";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  res.json(await getHealth());
});

healthRouter.post("/ytdlp/update", async (_req, res) => {
  const result = await updateYtDlp();
  const health = await getHealth();
  res.json({ ...result, health });
});
