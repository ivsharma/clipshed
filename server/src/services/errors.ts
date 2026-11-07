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

function errorTail(stderr: string): string {
  const cleaned = stripAnsi(stderr).trim();
  if (!cleaned) return "";
  return cleaned.slice(-4000);
}

/**
 * Converts yt-dlp's stderr into a useful message. The raw tail is kept as
 * details so the UI can show it in an expandable diagnostics area.
 */
export function mapYtDlpError(
  stderr: string,
  fallbackMessage = "The download failed.",
): AppError {
  const raw = stripAnsi(stderr);
  const text = raw.toLowerCase();
  const details = errorTail(stderr);

  const make = (code: string, message: string): AppError =>
    new AppError(code, message, 422, details || undefined);

  if (
    text.includes("sign in to confirm you're not a bot") ||
    text.includes("sign in to confirm you\u2019re not a bot") ||
    text.includes("not a bot")
  ) {
    return make(
      "BOT_CHECK",
      "YouTube is asking for a sign-in check. Add cookies in Settings, then try again.",
    );
  }

  if (
    text.includes("sign in to confirm your age") ||
    text.includes("age-restricted") ||
    text.includes("age restricted") ||
    text.includes("inappropriate for some users")
  ) {
    return make(
      "AGE_RESTRICTED",
      "This video is age-restricted. Add cookies from a signed-in browser in Settings.",
    );
  }

  if (
    text.includes("members-only") ||
    text.includes("members only") ||
    text.includes("join this channel") ||
    text.includes("requires payment")
  ) {
    return make(
      "MEMBERS_ONLY",
      "This video is members-only or paid. Use cookies from an account with access.",
    );
  }

  if (text.includes("private video") || text.includes("this video is private")) {
    return make("PRIVATE_VIDEO", "This video is private.");
  }

  if (
    text.includes("this live event will begin") ||
    text.includes("premieres in") ||
    text.includes("premiere will begin")
  ) {
    return make(
      "NOT_PREMIERED",
      "This video hasn't premiered yet. Try again after it starts.",
    );
  }

  if (
    text.includes("is live") ||
    text.includes("live stream") ||
    text.includes("live event") ||
    text.includes("this video is live")
  ) {
    return make(
      "LIVE_UNSUPPORTED",
      "Active live streams aren't supported. Try again after the stream ends.",
    );
  }

  if (
    text.includes("video unavailable") ||
    text.includes("has been removed") ||
    text.includes("no longer available") ||
    text.includes("this video is unavailable")
  ) {
    return make(
      "VIDEO_UNAVAILABLE",
      "This video is unavailable or has been removed.",
    );
  }

  if (
    text.includes("not available in your country") ||
    text.includes("blocked it in your country") ||
    text.includes("geo restricted") ||
    text.includes("geo-restricted")
  ) {
    return make(
      "GEO_BLOCKED",
      "This video is blocked in your region.",
    );
  }

  if (text.includes("drm") || text.includes("protected by drm")) {
    return make(
      "DRM_PROTECTED",
      "This video is DRM-protected and can't be downloaded.",
    );
  }

  if (text.includes("requested format is not available")) {
    return make(
      "FORMAT_UNAVAILABLE",
      "That quality isn't available for this video. Pick another quality and try again.",
    );
  }

  if (text.includes("http error 403") || text.includes("403 forbidden")) {
    return make(
      "HTTP_FORBIDDEN",
      "YouTube refused the request. Update yt-dlp and try again; if it persists, add cookies in Settings.",
    );
  }

  if (text.includes("http error 429") || text.includes("too many requests")) {
    return make(
      "RATE_LIMITED",
      "YouTube is rate-limiting this connection. Wait a little and try again.",
    );
  }

  if (
    text.includes("could not copy") && text.includes("cookie") ||
    text.includes("failed to decrypt") ||
    text.includes("cookie database")
  ) {
    return make(
      "COOKIES_ERROR",
      "Could not read cookies from that browser. Close the browser and try again, or export a cookies.txt file.",
    );
  }

  if (
    (text.includes("ffmpeg") && (text.includes("not found") || text.includes("not installed"))) ||
    (text.includes("ffprobe") && text.includes("not found"))
  ) {
    return make(
      "FFMPEG_MISSING",
      "ffmpeg isn't available. Run the setup script again so ffmpeg and ffprobe are in the bin folder.",
    );
  }

  if (text.includes("no space left") || text.includes("not enough space")) {
    return make("DISK_FULL", "There isn't enough disk space to finish this download.");
  }

  if (
    text.includes("unable to extract") ||
    text.includes("failed to extract") ||
    text.includes("nsig extraction failed")
  ) {
    return make(
      "EXTRACTOR_ERROR",
      "YouTube changed something and this yt-dlp version couldn't read the video. Update yt-dlp and try again.",
    );
  }

  if (
    text.includes("timed out") ||
    text.includes("connection reset") ||
    text.includes("connection refused") ||
    text.includes("unable to download webpage") ||
    text.includes("temporary failure in name resolution")
  ) {
    return make(
      "NETWORK_ERROR",
      "A network error interrupted the request. Check your connection and try again.",
    );
  }

  if (text.includes("unsupported url")) {
    return make("UNSUPPORTED_URL", "That URL isn't supported.");
  }

  return new AppError(
    "DOWNLOAD_FAILED",
    fallbackMessage,
    422,
    details || undefined,
  );
}
