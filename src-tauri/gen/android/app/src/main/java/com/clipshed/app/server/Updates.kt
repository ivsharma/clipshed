package com.clipshed.app.server

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant

class Updates(private val context: Context) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val mutex = Mutex()

    private var cached: UpdateCheck? = null
    private var cachedAt: Long = 0

    suspend fun check(): UpdateCheck {
        val now = System.currentTimeMillis()
        cached?.let { if (now - cachedAt < 10 * 60 * 1000) return it }

        return mutex.withLock {
            cached?.let { if (System.currentTimeMillis() - cachedAt < 10 * 60 * 1000) return it }
            val result = fetchLatestRelease()
            cached = result
            cachedAt = System.currentTimeMillis()
            result
        }
    }

    private suspend fun fetchLatestRelease(): UpdateCheck = withContext(Dispatchers.IO) {
        val url = URL("https://api.github.com/repos/ivsharma/clipshed/releases?per_page=30")
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 10_000
            readTimeout = 10_000
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("User-Agent", "Clipshed/${appVersion()}")
            setRequestProperty("X-GitHub-Api-Version", "2022-11-28")
        }

        val code = try {
            connection.responseCode
        } catch (error: Exception) {
            throw ApiException(
                "UPDATE_CHECK_FAILED",
                "Could not reach GitHub to check for updates.",
                502,
                error.message,
            )
        }

        if (code !in 200..299) {
            throw ApiException(
                "UPDATE_CHECK_FAILED",
                "GitHub returned an error while checking for updates.",
                502,
                "HTTP $code",
            )
        }

        val payload = json.parseToJsonElement(connection.inputStream.bufferedReader().readText())
        val releases = (payload as? JsonArray)?.mapNotNull { it as? JsonObject } ?: throw ApiException(
            "UPDATE_CHECK_FAILED",
            "GitHub returned an unexpected response.",
            502,
        )

        val latest = selectLatestRelease(releases)
        val currentVersion = versionFromTag(appVersion())
        UpdateCheck(
            currentVersion = currentVersion,
            latest = latest?.let(::toReleaseInfo),
            updateAvailable = latest != null && compareVersions(latest.str("tag_name").orEmpty(), currentVersion) > 0,
            checkedAt = Instant.now().toString(),
        )
    }

    fun appVersion(): String = runCatching {
        context.packageManager.getPackageInfo(context.packageName, 0).versionName
    }.getOrNull() ?: "1.1.0"

    data class Version(val major: Int, val minor: Int, val patch: Int, val prerelease: List<String>)

    fun parseVersion(value: String): Version? {
        val cleaned = value.trim().removePrefix("v").removePrefix("V").substringBefore("+").trim()
        if (cleaned.isEmpty()) return null

        val dash = cleaned.indexOf('-')
        val core = if (dash == -1) cleaned else cleaned.substring(0, dash)
        val pre = if (dash == -1) "" else cleaned.substring(dash + 1)
        if (dash != -1 && pre.isEmpty()) return null

        val parts = core.split('.')
        if (parts.size != 3 || parts.any { !it.matches(Regex("^\\d+$")) }) return null
        return Version(
            major = parts[0].toInt(),
            minor = parts[1].toInt(),
            patch = parts[2].toInt(),
            prerelease = if (pre.isEmpty()) emptyList() else pre.split('.'),
        )
    }

    fun compareVersions(a: String, b: String): Int {
        val left = parseVersion(a) ?: return 0
        val right = parseVersion(b) ?: return 0

        val core = (left.major - right.major).takeIf { it != 0 }
            ?: (left.minor - right.minor).takeIf { it != 0 }
            ?: (left.patch - right.patch)
        if (core != 0) return if (core > 0) 1 else -1

        if (left.prerelease.isEmpty() && right.prerelease.isEmpty()) return 0
        if (left.prerelease.isEmpty()) return 1
        if (right.prerelease.isEmpty()) return -1

        val length = maxOf(left.prerelease.size, right.prerelease.size)
        for (index in 0 until length) {
            val leftPart = left.prerelease.getOrNull(index) ?: return -1
            val rightPart = right.prerelease.getOrNull(index) ?: return 1
            if (leftPart == rightPart) continue

            val leftNumeric = leftPart.matches(Regex("^\\d+$"))
            val rightNumeric = rightPart.matches(Regex("^\\d+$"))
            if (leftNumeric && rightNumeric) {
                val diff = leftPart.toInt() - rightPart.toInt()
                if (diff != 0) return if (diff > 0) 1 else -1
                continue
            }
            if (leftNumeric != rightNumeric) return if (leftNumeric) -1 else 1
            return if (leftPart > rightPart) 1 else -1
        }
        return 0
    }

    fun selectLatestRelease(releases: List<JsonObject>): JsonObject? {
        var latest: JsonObject? = null
        for (release in releases) {
            if (release.bool("draft") == true) continue
            val tag = release.str("tag_name") ?: continue
            if (parseVersion(tag) == null) continue
            if (latest == null || compareVersions(tag, latest.str("tag_name").orEmpty()) > 0) latest = release
        }
        return latest
    }

    fun versionFromTag(tag: String): String =
        tag.trim().removePrefix("v").removePrefix("V").substringBefore("+").trim()

    private fun toReleaseInfo(release: JsonObject): ReleaseInfo {
        val tag = release.str("tag_name").orEmpty()
        return ReleaseInfo(
            version = versionFromTag(tag),
            tag = tag,
            name = release.str("name")?.takeIf { it.isNotBlank() } ?: tag,
            url = release.str("html_url").orEmpty(),
            publishedAt = release.strOrNull("published_at"),
            prerelease = release.bool("prerelease") == true,
        )
    }

    private fun JsonObject.str(key: String): String? =
        (this[key] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }

    private fun JsonObject.strOrNull(key: String): String? =
        (this[key] as? JsonPrimitive)?.contentOrNull

    private fun JsonObject.bool(key: String): Boolean? =
        (this[key] as? JsonPrimitive)?.booleanOrNull
}
