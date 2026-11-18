package com.clipshed.app.server

import kotlinx.serialization.Serializable

@Serializable
data class Range(val start: Double, val end: Double)

@Serializable
data class Quality(
    val height: Int,
    val label: String,
    val fps: Int,
    val h264: Boolean,
    val codecs: List<String>,
    val approxSize: Long? = null,
)

@Serializable
data class Chapter(val start: Double, val end: Double, val title: String)

@Serializable
data class ProbeResult(
    val platform: String,
    val mediaId: String,
    val url: String,
    val title: String,
    val uploader: String? = null,
    val duration: Double? = null,
    val thumbnail: String? = null,
    val qualities: List<Quality> = emptyList(),
    val chapters: List<Chapter> = emptyList(),
    val isLive: Boolean = false,
    val liveStatus: String? = null,
    val ageLimit: Int? = null,
    val availability: String? = null,
    val suggestedStart: Double? = null,
)

@Serializable
data class JobProgress(
    val percent: Double? = null,
    val downloadedBytes: Long = 0,
    val totalBytes: Long? = null,
    val speed: Double? = null,
    val eta: Double? = null,
    val detail: String? = null,
)

@Serializable
data class JobOutput(
    val filename: String,
    val size: Long,
    val duration: Double? = null,
    val mime: String,
    val downloadUrl: String,
)

@Serializable
data class JobError(val code: String, val message: String, val details: String? = null)

@Serializable
data class Job(
    val id: String,
    val url: String,
    val platform: String,
    val mediaId: String,
    var title: String,
    var uploader: String? = null,
    var thumbnail: String? = null,
    var duration: Double? = null,
    val kind: String,
    var height: Int? = null,
    val bitrate: Int? = null,
    var range: Range? = null,
    val precise: Boolean = false,
    var status: String,
    var stage: String,
    var progress: JobProgress,
    var output: JobOutput? = null,
    var audioOutput: JobOutput? = null,
    var error: JobError? = null,
    val createdAt: Long,
    var startedAt: Long? = null,
    var finishedAt: Long? = null,
)

@Serializable
data class Settings(
    val cookiesMode: String = "none",
    val cookiesBrowser: String = "chrome",
    val cookiesFile: String = "",
    val preferH264: Boolean = true,
)

@Serializable
data class Health(
    val ok: Boolean,
    val appVersion: String,
    val ytdlpVersion: String? = null,
    val ffmpegVersion: String? = null,
    val nodeVersion: String,
    val binariesOk: Boolean,
    val cookiesConfigured: Boolean,
)

@Serializable
data class ReleaseInfo(
    val version: String,
    val tag: String,
    val name: String,
    val url: String,
    val publishedAt: String? = null,
    val prerelease: Boolean = false,
)

@Serializable
data class UpdateCheck(
    val currentVersion: String,
    val latest: ReleaseInfo? = null,
    val updateAvailable: Boolean = false,
    val checkedAt: String,
)

@Serializable
data class SettingsPayload(val settings: Settings, val health: Health)

@Serializable
data class ApiErrorBody(val code: String, val message: String, val details: String? = null)

@Serializable
data class ApiErrorPayload(val error: ApiErrorBody)

@Serializable
data class JobEvent(val type: String, val job: Job)

@Serializable
data class JobsPayload(val jobs: List<Job>)

@Serializable
data class ProbeRequest(val url: String)

@Serializable
data class JobRequest(
    val url: String,
    val kind: String,
    val height: Int? = null,
    val bitrate: Int? = null,
    val range: Range? = null,
    val precise: Boolean = false,
)

@Serializable
data class SettingsUpdate(
    val cookiesMode: String? = null,
    val cookiesBrowser: String? = null,
    val cookiesFile: String? = null,
    val preferH264: Boolean? = null,
)

@Serializable
data class CookiesImport(val filename: String, val content: String)

@Serializable
data class SaveRequest(val kind: String)

@Serializable
data class SaveResult(val saved: Boolean, val filename: String, val uri: String)

@Serializable
data class UpdateResult(val ok: Boolean, val output: String, val health: Health)

@Serializable
data class ClipboardPayload(val text: String? = null)
