package com.clipshed.app.server

import android.net.Uri
import java.text.Normalizer
import java.util.Locale
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.round

data class MediaSource(
    val platform: String,
    val mediaId: String,
    val url: String,
    val startAt: Double?,
)

data class ResolvedMedia(
    val ok: Boolean,
    val source: MediaSource? = null,
    val error: String? = null,
)

private val YOUTUBE_ID = Regex("^[A-Za-z0-9_-]{11}$")
private val FACEBOOK_ID = Regex("^\\d{5,}$")
private val INSTAGRAM_CODE = Regex("^[A-Za-z0-9_-]{5,}$")

private val YOUTUBE_HOSTS = setOf(
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
    "youtu.be",
    "www.youtu.be",
)

private val FACEBOOK_HOSTS = setOf(
    "facebook.com",
    "www.facebook.com",
    "m.facebook.com",
    "web.facebook.com",
    "fb.watch",
)

private val INSTAGRAM_HOSTS = setOf("instagram.com", "www.instagram.com")

private fun failure(message: String) = ResolvedMedia(false, error = message)

private fun parseUri(input: String): Uri? {
    val withScheme = if (Regex("^[a-z][a-z0-9+.-]*:", RegexOption.IGNORE_CASE).containsMatchIn(input)) {
        input
    } else {
        "https://$input"
    }
    return runCatching { Uri.parse(withScheme) }.getOrNull()
}

private fun parseYoutube(uri: Uri): ResolvedMedia {
    val segments = uri.pathSegments
    val host = uri.host?.lowercase(Locale.ROOT).orEmpty()
    val id = if (host.endsWith("youtu.be")) {
        segments.firstOrNull()
    } else {
        when (segments.firstOrNull()?.lowercase(Locale.ROOT)) {
            "watch" -> uri.getQueryParameter("v")
            "shorts", "embed", "live", "v" -> segments.getOrNull(1)
            "playlist" -> return failure("Playlists aren't supported yet. Paste a link to a single video.")
            else -> return failure("Paste a link to a single YouTube video, Short, or livestream replay.")
        }
    }

    if (id == null || !YOUTUBE_ID.matches(id)) return failure("That doesn't look like a YouTube video link.")
    return ResolvedMedia(
        true,
        MediaSource("youtube", id, "https://www.youtube.com/watch?v=$id", startAtOf(uri)),
    )
}

private fun parseFacebook(uri: Uri): ResolvedMedia {
    val segments = uri.pathSegments
    if (uri.host?.lowercase(Locale.ROOT) == "fb.watch") {
        val code = segments.firstOrNull()
            ?: return failure("That doesn't look like a Facebook video link.")
        return ResolvedMedia(true, MediaSource("facebook", code, uri.toString(), startAtOf(uri)))
    }

    var id: String? = null
    var reel = false
    when (segments.firstOrNull()?.lowercase(Locale.ROOT)) {
        "watch" -> id = uri.getQueryParameter("v")
        "reel" -> {
            id = segments.getOrNull(1)
            reel = true
        }
        "videos" -> id = segments.getOrNull(1)
    }
    if (id == null && segments.getOrNull(1) == "videos") id = segments.getOrNull(2)

    if (id == null || !FACEBOOK_ID.matches(id)) return failure("Paste a link to a Facebook video or reel.")
    val canonical = if (reel) "https://www.facebook.com/reel/$id" else "https://www.facebook.com/watch/?v=$id"
    return ResolvedMedia(true, MediaSource("facebook", id, canonical, startAtOf(uri)))
}

private fun parseInstagram(uri: Uri): ResolvedMedia {
    val kind = uri.pathSegments.getOrNull(0)?.lowercase(Locale.ROOT)
    val code = uri.pathSegments.getOrNull(1)
    if (kind == null || code == null) return failure("Paste a link to an Instagram post or reel.")
    if (kind !in setOf("p", "reel", "reels", "tv")) {
        return failure("Stories and profiles aren't supported. Paste a post or reel link.")
    }
    if (!INSTAGRAM_CODE.matches(code)) return failure("That doesn't look like an Instagram link.")
    val route = if (kind == "reels") "reel" else kind
    return ResolvedMedia(
        true,
        MediaSource("instagram", code, "https://www.instagram.com/$route/$code/", startAtOf(uri)),
    )
}

private fun startAtOf(uri: Uri): Double? {
    val fragmentQuery = uri.fragment
        ?.split("&")
        ?.firstOrNull { it.startsWith("t=") }
        ?.substringAfter("t=")
    val raw = uri.getQueryParameter("t")
        ?: uri.getQueryParameter("start")
        ?: fragmentQuery
    return raw?.let(::parseTime)
}

fun resolveMediaUrl(input: String): ResolvedMedia {
    val trimmed = input.trim()
    if (trimmed.isEmpty()) return failure("Paste a video link first.")

    val uri = parseUri(trimmed) ?: return failure("That doesn't look like a valid URL.")
    val scheme = uri.scheme?.lowercase(Locale.ROOT)
    if (scheme != "http" && scheme != "https") return failure("Only http and https links are supported.")
    if (uri.userInfo != null) return failure("That URL contains credentials, which aren't supported.")

    val host = uri.host?.lowercase(Locale.ROOT) ?: return failure("That doesn't look like a valid URL.")
    return when {
        host in YOUTUBE_HOSTS -> parseYoutube(uri)
        host in FACEBOOK_HOSTS -> parseFacebook(uri)
        host in INSTAGRAM_HOSTS -> parseInstagram(uri)
        else -> failure("Only YouTube, Facebook, Instagram links are supported right now.")
    }
}

fun parseTime(input: String): Double? {
    val value = input.trim().lowercase(Locale.ROOT).replace(',', '.')
    if (value.isEmpty() || value.length > 64) return null

    if (value.contains(":")) {
        val parts = value.split(":")
        if (parts.size > 3) return null
        val numbers = parts.map { it.trim().toDoubleOrNull()?.takeIf { number -> number >= 0 } ?: return null }
        return when (numbers.size) {
            2 -> {
                if (numbers[1] >= 60) return null
                numbers[0] * 60 + numbers[1]
            }
            3 -> {
                if (numbers[1] >= 60 || numbers[2] >= 60) return null
                numbers[0] * 3600 + numbers[1] * 60 + numbers[2]
            }
            else -> null
        }
    }

    val unitPattern =
        Regex("(\\d+(?:\\.\\d+)?)\\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)(?![a-z])")
    var total = 0.0
    var matched = false
    var lastIndex = 0
    for (match in unitPattern.findAll(value)) {
        if (value.substring(lastIndex, match.range.first).trim().isNotEmpty()) return null
        val amount = match.groupValues[1].toDoubleOrNull() ?: return null
        val unit = match.groupValues[2]
        total += when {
            unit.startsWith("h") -> amount * 3600
            unit.startsWith("m") -> amount * 60
            else -> amount
        }
        matched = true
        lastIndex = match.range.last + 1
    }
    if (matched) return if (value.substring(lastIndex).trim().isEmpty()) total else null
    if (Regex("^\\d+(?:\\.\\d+)?$").matches(value)) return value.toDouble()
    return null
}

fun formatSectionTimestamp(seconds: Double): String {
    val safe = max(0.0, if (seconds.isFinite()) seconds else 0.0)
    val totalMillis = round(safe * 1000.0).toLong()
    val millis = totalMillis % 1000
    val totalSeconds = totalMillis / 1000
    val hours = totalSeconds / 3600
    val minutes = (totalSeconds % 3600) / 60
    val secs = totalSeconds % 60
    return String.format(Locale.US, "%02d:%02d:%02d.%03d", hours, minutes, secs, millis)
}

fun formatRangeSlug(start: Double, end: Double): String {
    fun part(value: Double): String {
        val safe = max(0L, Math.round(value))
        val hours = safe / 3600
        val minutes = (safe % 3600) / 60
        val secs = safe % 60
        return when {
            hours > 0 -> "${hours}h${minutes.toString().padStart(2, '0')}m${secs.toString().padStart(2, '0')}s"
            minutes > 0 -> "${minutes}m${secs.toString().padStart(2, '0')}s"
            else -> "${secs}s"
        }
    }
    return "${part(start)}-${part(end)}"
}

fun sanitizeFilename(input: String, fallback: String = "video"): String {
    var name = Normalizer.normalize(input, Normalizer.Form.NFKC)
        .replace(Regex("[\\u0000-\\u001f\\u007f]"), "")
        .replace(Regex("[<>:\"/\\\\|?*]+"), " ")
        .replace(Regex("\\s+"), " ")
        .trim()

    name = name.replace(Regex("[. ]+$"), "").trim()
    if (name.isEmpty()) name = fallback
    if (Regex("^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\\..*)?$", RegexOption.IGNORE_CASE).matches(name)) {
        name = "_$name"
    }
    if (name.length > 110) name = name.take(110).trim()
    return name.ifEmpty { fallback }
}

fun buildOutputBase(title: String, range: Range?, fallback: String): String {
    val safeTitle = sanitizeFilename(title, fallback)
    if (range == null) return safeTitle
    val suffix = " [${formatRangeSlug(range.start, range.end)}]"
    val maxBaseLength = 110 - suffix.length
    val truncated = safeTitle.take(max(1, maxBaseLength)).trim()
    return "$truncated$suffix"
}
