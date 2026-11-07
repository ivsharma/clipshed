import { z } from "zod";

export const rangeSchema = z
  .object({
    start: z.number().finite().min(0),
    end: z.number().finite().positive(),
  })
  .refine((range) => range.end > range.start, {
    message: "End must be greater than start.",
    path: ["end"],
  });

export const probeRequestSchema = z.object({
  url: z.string().trim().min(1).max(4096),
});

export const jobRequestSchema = z.object({
  url: z.string().trim().min(1).max(4096),
  kind: z.enum(["mp4", "mp3", "both"]),
  height: z.number().int().min(144).max(4320).optional(),
  bitrate: z.number().int().min(64).max(320).optional(),
  range: rangeSchema.nullish(),
  precise: z.boolean().optional().default(false),
});

export const cookiesModeSchema = z.enum(["none", "file", "browser"]);

export const cookiesBrowserSchema = z.enum([
  "chrome",
  "edge",
  "firefox",
  "brave",
  "chromium",
  "opera",
  "vivaldi",
]);

export const settingsSchema = z.object({
  cookiesMode: cookiesModeSchema.default("none"),
  cookiesBrowser: cookiesBrowserSchema.default("chrome"),
  cookiesFile: z.string().max(4096).default(""),
  preferH264: z.boolean().default(true),
});

export const settingsUpdateSchema = settingsSchema.partial();

export type ProbeRequest = z.infer<typeof probeRequestSchema>;
export type JobRequest = z.infer<typeof jobRequestSchema>;
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
