export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: string;

  constructor(code: string, message: string, statusCode = 400, details?: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

const has =
  (...needles: string[]) =>
  (text: string): boolean =>
    needles.some((needle) => text.includes(needle));

interface Rule {
  code: string;
  message: string;
  when: (text: string) => boolean;
}

/** Order matters: the first matching rule wins. Add per-site rules before generic ones. */
const RULES: Rule[] = [
  {
    code: "BOT_CHECK",
    message: "The site is asking for a sign-in check. Add cookies in Settings, then try again.",
    when: has("not a bot"),
  },
  {
    code: "AGE_RESTRICTED",
    message: "This video is age-restricted. Add cookies from a signed-in browser in Settings.",
    when: has(
      "sign in to confirm your age",
      "age-restricted",
      "age restricted",
      "inappropriate for some users",
    ),
  },
  {
    code: "MEMBERS_ONLY",
    message: "This video is members-only or paid. Use cookies from an account with access.",
    when: has("members-only", "members only", "join this channel", "requires payment"),
  },
  {
    code: "PRIVATE_VIDEO",
    message: "This video is private.",
    when: has("private video", "this video is private"),
  },
  {
    code: "NOT_PREMIERED",
    message: "This video hasn't premiered yet. Try again after it starts.",
    when: has("this live event will begin", "premieres in", "premiere will begin"),
  },
  {
    code: "LIVE_UNSUPPORTED",
    message: "Active live streams aren't supported. Try again after the stream ends.",
    when: has("is live", "live stream", "live event", "this video is live"),
  },
  {
    code: "UNAVAILABLE",
    message: "This video is unavailable or has been removed.",
    when: has(
      "video unavailable",
      "has been removed",
      "no longer available",
      "this video is unavailable",
      "content isn't available",
      "content is not available",
    ),
  },
  {
    code: "GEO_BLOCKED",
    message: "This video is blocked in your region.",
    when: has(
      "not available in your country",
      "blocked it in your country",
      "geo restricted",
      "geo-restricted",
    ),
  },
  {
    code: "DRM_PROTECTED",
    message: "This video is DRM-protected and can't be downloaded.",
    when: has("protected by drm", "drm-protected"),
  },
  {
    code: "FORMAT_UNAVAILABLE",
    message: "That quality isn't available for this video. Pick another quality and try again.",
    when: has("requested format is not available"),
  },
  {
    code: "LOGIN_REQUIRED",
    message: "This content needs a signed-in session. Add cookies for this site in Settings, then try again.",
    when: has("login required", "log in to", "you need to log in", "use --cookies", "sign in to view"),
  },
  {
    code: "HTTP_FORBIDDEN",
    message: "The site refused the request. Update yt-dlp and try again; if it persists, add cookies in Settings.",
    when: has("http error 403", "403 forbidden"),
  },
  {
    code: "RATE_LIMITED",
    message: "The site is rate-limiting this connection. Wait a little and try again.",
    when: has("http error 429", "too many requests", "rate-limit reached"),
  },
  {
    code: "OPERA_GX_UNSUPPORTED",
    message:
      "yt-dlp's Opera mode only reads Opera Stable. Opera GX uses a different folder. Export a cookies.txt file and choose Cookies file in Settings.",
    when: has("could not find opera cookies database"),
  },
  {
    code: "COOKIES_ERROR",
    message:
      "Could not read cookies from that browser. Close the browser and try again, or export a cookies.txt file.",
    when: (text) =>
      (text.includes("could not copy") && text.includes("cookie")) ||
      has("failed to decrypt", "cookie database")(text),
  },
  {
    code: "FFMPEG_MISSING",
    message: "ffmpeg isn't available. Run the setup script again so ffmpeg and ffprobe are in the bin folder.",
    when: (text) =>
      (text.includes("ffmpeg") && (text.includes("not found") || text.includes("not installed"))) ||
      (text.includes("ffprobe") && text.includes("not found")),
  },
  {
    code: "DISK_FULL",
    message: "There isn't enough disk space to finish this download.",
    when: has("no space left", "not enough space"),
  },
  {
    code: "EXTRACTOR_ERROR",
    message: "The site changed something and this yt-dlp version couldn't read the video. Update yt-dlp and try again.",
    when: has("unable to extract", "failed to extract", "nsig extraction failed"),
  },
  {
    code: "NETWORK_ERROR",
    message: "A network error interrupted the request. Check your connection and try again.",
    when: has(
      "timed out",
      "connection reset",
      "connection refused",
      "unable to download webpage",
      "temporary failure in name resolution",
    ),
  },
  {
    code: "UNSUPPORTED_URL",
    message: "That URL isn't supported.",
    when: has("unsupported url"),
  },
];

/**
 * Converts yt-dlp's stderr into a user-facing error. The raw tail is kept as
 * `details` so the UI can show it in an expandable diagnostics area.
 */
export function mapYtDlpError(stderr: string, fallbackMessage = "The download failed."): AppError {
  const cleaned = stripAnsi(stderr).trim();
  const details = cleaned ? cleaned.slice(-4000) : undefined;
  const text = cleaned.toLowerCase();

  const rule = RULES.find((candidate) => candidate.when(text));
  if (rule) return new AppError(rule.code, rule.message, 422, details);

  return new AppError("DOWNLOAD_FAILED", fallbackMessage, 422, details);
}
