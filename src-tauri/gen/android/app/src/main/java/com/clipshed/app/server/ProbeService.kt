package com.clipshed.app.server

import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import com.yausername.youtubedl_android.YoutubeDLResponse
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.concurrent.thread
import kotlin.math.roundToInt
import kotlin.math.roundToLong

class ProbeService(
    private val scope: CoroutineScope,
    private val settingsStore: SettingsStore,
) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val cache = ConcurrentHashMap<String, CacheEntry>()
    private val inflight = ConcurrentHashMap<String, Deferred<ProbeResult>>()

    private data class CacheEntry(val value: ProbeResult, val expiresAt: Long)

    suspend fun probe(source: MediaSource, requestedSettings: Settings? = null): ProbeResult {
        val settings = requestedSettings ?: settingsStore.get()
        val key = "${source.platform}:${source.mediaId}"
        cache[key]?.let { if (it.expiresAt > System.currentTimeMillis()) return it.value }

        val deferred = inflight.computeIfAbsent(key) {
            scope.async { fetch(source, settings) }
        }
        return try {
            val result = deferred.await()
            cache[key] = CacheEntry(result, System.currentTimeMillis() + 10 * 60 * 1000)
            while (cache.size > 100) {
                val oldest = cache.keys.firstOrNull() ?: break
                cache.remove(oldest)
            }
            result
        } finally {
            inflight.remove(key, deferred)
        }
    }

    private suspend fun fetch(source: MediaSource, settings: Settings): ProbeResult = withContext(Dispatchers.IO) {
        val request = YoutubeDLRequest(source.url)
            .addOption("--dump-single-json")
            .addOption("--skip-download")
            .addOption("--no-warnings")
            .addOption("--no-progress")
            .addOption("--no-playlist")
            .addOption("--retries", "5")
            .addOption("--extractor-retries", "3")
        settingsStore.cookiesArgs(settings).forEach { request.addOption(it) }

        val processId = "probe-${UUID.randomUUID()}"
        val response = try {
            runWithTimeout(request, processId, 120_000)
        } catch (error: TimeoutCancellationException) {
            YoutubeDL.getInstance().destroyProcessById(processId)
            throw ApiException("PROBE_TIMEOUT", "The site took too long to respond. Try again.", 504)
        }

        if (response.exitCode != 0) {
            throw mapYtDlpError(response.err.ifBlank { response.out }, "Could not read this video.")
        }

        val text = response.out.trim()
        val start = text.indexOf('{')
        val end = text.lastIndexOf('}')
        val payload = if (start >= 0 && end > start) text.substring(start, end + 1) else text
        val root = runCatching { json.parseToJsonElement(payload).jsonObject }.getOrElse {
            throw ApiException(
                "PROBE_PARSE",
                "The video information came back in an unexpected format. Try again.",
                502,
                it.message,
            )
        }

        if (root.str("_type") == "playlist" || root["entries"] is JsonArray) {
            throw ApiException("PLAYLIST_UNSUPPORTED", "Playlists aren't supported yet. Paste a link to a single video.")
        }

        normalize(root, source)
    }

    private suspend fun runWithTimeout(
        request: YoutubeDLRequest,
        processId: String,
        timeoutMs: Long,
    ): YoutubeDLResponse {
        val deferred = CompletableDeferred<YoutubeDLResponse>()
        val worker = thread(start = true, isDaemon = true) {
            try {
                deferred.complete(YoutubeDL.getInstance().execute(request, processId, null))
            } catch (error: Throwable) {
                deferred.completeExceptionally(error)
            }
        }
        return try {
            withTimeout(timeoutMs) { deferred.await() }
        } finally {
            worker.interrupt()
        }
    }

    private fun normalize(info: JsonObject, source: MediaSource): ProbeResult {
        val duration = info.num("duration")?.takeIf { it > 0 }
        val thumbnails = info.objs("thumbnails")
        val bestThumbnail = thumbnails.maxByOrNull { it.num("width") ?: 0.0 }
        val liveStatus = info.str("live_status")

        val chapters = info.objs("chapters")
            .mapIndexed { index, chapter ->
                Chapter(
                    start = chapter.num("start_time") ?: 0.0,
                    end = chapter.num("end_time") ?: 0.0,
                    title = chapter.str("title") ?: "Chapter ${index + 1}",
                )
            }
            .filter { it.end > it.start }
            .sortedBy { it.start }

        return ProbeResult(
            platform = source.platform,
            mediaId = source.mediaId,
            url = source.url,
            title = info.str("title") ?: "Untitled video",
            uploader = info.str("uploader") ?: info.str("channel"),
            duration = duration,
            thumbnail = info.str("thumbnail") ?: bestThumbnail?.str("url"),
            qualities = buildQualities(info.objs("formats"), duration),
            chapters = chapters,
            isLive = info.bool("is_live") == true || liveStatus == "is_live",
            liveStatus = liveStatus,
            ageLimit = info.int("age_limit"),
            availability = info.str("availability"),
            suggestedStart = null,
        )
    }

    private fun buildQualities(formats: List<JsonObject>, duration: Double?): List<Quality> {
        val audioOnly = formats.filter { format ->
            val vcodec = format.str("vcodec")
            (vcodec == null || vcodec == "none") && format.str("acodec") != null
        }
        val audioBytes = audioOnly.maxByOrNull { tbr(it) }?.let { estimateBytes(it, duration) }

        val groups = LinkedHashMap<Int, MutableList<JsonObject>>()
        for (format in formats) {
            val height = format.int("height") ?: continue
            if (height <= 0 || !isVideoFormat(format)) continue
            groups.getOrPut(height) { mutableListOf() }.add(format)
        }

        return groups.map { (height, group) ->
            val fps = group.maxOf { it.num("fps") ?: 0.0 }.roundToInt()
            val codecs = group.mapNotNull { it.str("vcodec") }.map(::codecLabel).distinct()
            val h264 = group.any { Regex("^(avc1|h264)", RegexOption.IGNORE_CASE).containsMatchIn(it.str("vcodec").orEmpty()) }
            val direct = group.filter {
                val protocol = it.str("protocol")?.lowercase()
                protocol == "http" || protocol == "https"
            }
            val best = (direct.ifEmpty { group }).maxByOrNull { tbr(it) }
            val videoBytes = best?.let { estimateBytes(it, duration) }
            Quality(
                height = height,
                label = "${height}p${if (fps >= 50) "60" else ""}",
                fps = fps,
                h264 = h264,
                codecs = codecs,
                approxSize = videoBytes?.let { it + (audioBytes ?: 0) },
            )
        }.sortedByDescending { it.height }
    }

    private fun estimateBytes(format: JsonObject, duration: Double?): Long? {
        val exact = format.num("filesize") ?: format.num("filesize_approx")
        if (exact != null && exact > 0) return exact.toLong()
        val rate = format.num("tbr")
        return if (rate != null && rate > 0 && duration != null) {
            ((rate * 1000 * duration) / 8).roundToLong()
        } else {
            null
        }
    }

    private fun isVideoFormat(format: JsonObject): Boolean {
        val vcodec = format.str("vcodec")
        val ext = format.str("ext")
        val note = format.str("format_note")?.lowercase().orEmpty()
        return vcodec != null && vcodec != "none" && vcodec != "images" && ext != "mhtml" && !note.contains("storyboard")
    }

    private fun codecLabel(vcodec: String): String {
        val codec = vcodec.lowercase()
        return when {
            codec.startsWith("avc1") || codec.startsWith("h264") -> "H.264"
            codec.startsWith("vp09") || codec.startsWith("vp9") -> "VP9"
            codec.startsWith("av01") -> "AV1"
            codec.startsWith("hev1") || codec.startsWith("hvc1") -> "HEVC"
            else -> codec.split('.')[0]?.uppercase() ?: codec.uppercase()
        }
    }

    private fun tbr(format: JsonObject): Double = format.num("tbr") ?: 0.0

    private fun JsonObject.str(key: String): String? {
        val primitive = this[key] as? JsonPrimitive ?: return null
        if (primitive is JsonNull) return null
        return primitive.contentOrNull?.takeIf { it.isNotBlank() }
    }

    private fun JsonObject.num(key: String): Double? = (this[key] as? JsonPrimitive)?.doubleOrNull
    private fun JsonObject.int(key: String): Int? = (this[key] as? JsonPrimitive)?.intOrNull
    private fun JsonObject.bool(key: String): Boolean? = (this[key] as? JsonPrimitive)?.booleanOrNull
    private fun JsonObject.objs(key: String): List<JsonObject> =
        (this[key] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()
}

fun chooseQuality(probe: ProbeResult, requestedHeight: Int?): Quality {
    if (probe.qualities.isEmpty()) {
        throw ApiException(
            "NO_VIDEO_FORMAT",
            "This video doesn't have a downloadable video stream. Try MP3 instead.",
            422,
        )
    }
    val fallback = probe.qualities.firstOrNull { it.height <= 1080 }
    val target = requestedHeight ?: (fallback ?: probe.qualities.first()).height
    return probe.qualities.firstOrNull { it.height <= target } ?: probe.qualities.last()
}

fun formatSelector(quality: Quality, preferH264: Boolean): String {
    val height = quality.height
    return if (preferH264 && quality.h264) {
        "bv*[height<=$height][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=$height]+ba/b[height<=$height]"
    } else {
        "bv*[height<=$height]+ba/b[height<=$height]"
    }
}
