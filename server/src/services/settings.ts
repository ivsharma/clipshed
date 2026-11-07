import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  settingsSchema,
  type Settings,
  type SettingsUpdate,
} from "@clipshed/shared";
import { config } from "../config";
import { log } from "../lib/logger";

const DEFAULTS: Settings = {
  cookiesMode: "none",
  cookiesBrowser: "chrome",
  cookiesFile: "",
  preferH264: true,
};

let cached: Settings | null = null;

export async function loadSettings(force = false): Promise<Settings> {
  if (cached && !force) return cached;

  try {
    const raw = await fs.readFile(config.settingsFile, "utf8");
    const parsed = settingsSchema.parse(JSON.parse(raw));
    cached = parsed;
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      log.warn("Could not read settings; using defaults.", error);
    }
    cached = { ...DEFAULTS };
    return cached;
  }
}

export async function getSettings(): Promise<Settings> {
  return cached ?? loadSettings();
}

export async function updateSettings(patch: SettingsUpdate): Promise<Settings> {
  const current = await getSettings();
  const next = settingsSchema.parse({ ...current, ...patch });
  await fs.mkdir(path.dirname(config.settingsFile), { recursive: true });
  const temp = `${config.settingsFile}.tmp`;
  await fs.writeFile(temp, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(temp, config.settingsFile);
  cached = next;
  return next;
}

export function resolveCookiesFile(settings: Settings): string | null {
  const value = settings.cookiesFile.trim();
  if (!value) return null;
  return path.isAbsolute(value) ? value : path.resolve(config.rootDir, value);
}

export function isCookiesConfigured(settings: Settings): boolean {
  if (settings.cookiesMode === "browser") return true;
  if (settings.cookiesMode === "file") {
    const file = resolveCookiesFile(settings);
    return Boolean(file && existsSync(file));
  }
  return false;
}
