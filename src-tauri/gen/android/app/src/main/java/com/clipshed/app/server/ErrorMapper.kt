package com.clipshed.app.server

class ApiException(
    val code: String,
    override val message: String,
    val statusCode: Int = 400,
    val details: String? = null,
) : Exception(message)

fun stripAnsi(value: String): String =
    value.replace(Regex("\\u001b\\[[0-?]*[ -/]*[@-~]"), "")

private data class ErrorRule(
    val code: String,
    val message: String,
    val matches: (String) -> Boolean,
)

private fun has(vararg needles: String): (String) -> Boolean = { text ->
    needles.any { text.contains(it) }
}

private val RULES = listOf(
    ErrorRule(
        "BOT_CHECK",
        "The site is asking for a sign-in check. Cookie sign-in is coming soon; try again later or use a different network.",
        has("not a bot"),
    ),
    ErrorRule(
        "AGE_RESTRICTED",
        "This video is age-restricted. Add cookies from a signed-in browser in Settings.",
        has("sign in to confirm your age", "age-restricted", "age restricted", "inappropriate for some users"),
    ),
    ErrorRule(
        "MEMBERS_ONLY",
        "This video is members-only or paid. Use cookies from an account with access.",
        has("members-only", "members only", "join this channel", "requires payment"),
    ),
    ErrorRule("PRIVATE_VIDEO", "This video is private.", has("private video", "this video is private")),
    ErrorRule(
        "NOT_PREMIERED",
        "This video hasn't premiered yet. Try again after it starts.",
        has("this live event will begin", "premieres in", "premiere will begin"),
    ),
    ErrorRule(
        "LIVE_UNSUPPORTED",
        "Active live streams aren't supported. Try again after the stream ends.",
        has("is live", "live stream", "live event", "this video is live"),
    ),
    ErrorRule(
        "UNAVAILABLE",
        "This video is unavailable or has been removed.",
        has(
            "video unavailable",
            "has been removed",
            "no longer available",
            "this video is unavailable",
            "content isn't available",
            "content is not available",
        ),
    ),
    ErrorRule(
        "GEO_BLOCKED",
        "This video is blocked in your region.",
        has("not available in your country", "blocked it in your country", "geo restricted", "geo-restricted"),
    ),
    ErrorRule("DRM_PROTECTED", "This video is DRM-protected and can't be downloaded.", has("protected by drm", "drm-protected")),
    ErrorRule(
        "FORMAT_UNAVAILABLE",
        "That quality isn't available for this video. Pick another quality and try again.",
        has("requested format is not available"),
    ),
    ErrorRule(
        "LOGIN_REQUIRED",
        "This content needs a signed-in session. Add cookies for this site in Settings, then try again.",
        has("login required", "log in to", "you need to log in", "use --cookies", "sign in to view"),
    ),
    ErrorRule(
        "HTTP_FORBIDDEN",
        "The site refused the request. Update yt-dlp and try again; if it persists, add cookies in Settings.",
        has("http error 403", "403 forbidden"),
    ),
    ErrorRule("RATE_LIMITED", "The site is rate-limiting this connection. Wait a little and try again.", has("http error 429", "too many requests", "rate-limit reached")),
    ErrorRule(
        "COOKIES_ERROR",
        "Could not read the cookie file. Export a fresh cookies.txt and import it again.",
        { text ->
            (text.contains("could not copy") && text.contains("cookie")) ||
                text.contains("failed to decrypt") ||
                text.contains("cookie database")
        },
    ),
    ErrorRule(
        "FFMPEG_MISSING",
        "ffmpeg isn't available in this build.",
        { text -> text.contains("ffmpeg") && (text.contains("not found") || text.contains("not installed")) },
    ),
    ErrorRule("DISK_FULL", "There isn't enough disk space to finish this download.", has("no space left", "not enough space")),
    ErrorRule(
        "EXTRACTOR_ERROR",
        "The site changed something and this yt-dlp version couldn't read the video. Update yt-dlp and try again.",
        has("unable to extract", "failed to extract", "nsig extraction failed"),
    ),
    ErrorRule(
        "NETWORK_ERROR",
        "A network error interrupted the request. Check your connection and try again.",
        has(
            "timed out",
            "connection reset",
            "connection refused",
            "unable to download webpage",
            "temporary failure in name resolution",
        ),
    ),
    ErrorRule("UNSUPPORTED_URL", "That URL isn't supported.", has("unsupported url")),
)

fun mapYtDlpError(stderr: String, fallbackMessage: String = "The download failed."): ApiException {
    val cleaned = stripAnsi(stderr).trim()
    val details = cleaned.takeLast(4000).ifBlank { null }
    val text = cleaned.lowercase()
    val rule = RULES.firstOrNull { it.matches(text) }
    return if (rule != null) {
        ApiException(rule.code, rule.message, 422, details)
    } else {
        ApiException("DOWNLOAD_FAILED", fallbackMessage, 422, details)
    }
}
