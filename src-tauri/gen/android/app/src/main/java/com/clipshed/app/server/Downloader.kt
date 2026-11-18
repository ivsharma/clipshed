package com.clipshed.app.server

import android.content.Context
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.TimeUnit
import kotlin.math.pow
import kotlin.math.roundToLong

class DownloadCancelled : Exception()

class DownloadHandle(
    private val context: Context,
    val processId: String,
) {
    @Volatile
    var cancelled: Boolean = false
        private set

    @Volatile
    var ffmpeg: Process? = null

    fun cancel() {
        cancelled = true
        YoutubeDL.getInstance().destroyProcessById(processId)
        ffmpeg?.destroy()
    }
}

data class DownloadedFile(
    val filename: String,
    val size: Long,
    val duration: Double?,
    val mime: String,
)

data class DownloadResult(val video: DownloadedFile, val audio: DownloadedFile?)

class Downloader(
    private val context: Context,
    private val settingsStore: SettingsStore,
) {
    private val downloadsDir = File(context.filesDir, "downloads")
    private val tempRoot = File(context.filesDir, "tmp")

    suspend fun download(
        job: Job,
        quality: Quality?,
        settings: Settings,
        onProgress: (JobProgress) -> Unit,
        onStage: (String) -> Unit,
        onHandle: (DownloadHandle) -> Unit,
    ): DownloadResult = withContext(Dispatchers.IO) {
        val tempDir = File(tempRoot, job.id).apply {
            deleteRecursively()
            mkdirs()
        }
        val jobDownloads = File(downloadsDir, job.id).apply { mkdirs() }
        val base = buildOutputBase(job.title, job.range, job.mediaId)
        val processId = "job-${job.id}"
        val handle = DownloadHandle(context, processId)
        onHandle(handle)

        try {
            val request = YoutubeDLRequest(job.url)
                .addOption("--newline")
                .addOption("--no-warnings")
                .addOption("--no-playlist")
                .addOption("--no-mtime")
                .addOption("--embed-metadata")
                .addOption("--retries", "10")
                .addOption("--fragment-retries", "10")
                .addOption("--extractor-retries", "3")
                .addOption("--concurrent-fragments", "4")
                .addOption("--downloader-args", "ffmpeg:-progress pipe:2 -nostats")
                .addOption("-o", File(tempDir, "$base.%(ext)s").absolutePath)

            settingsStore.cookiesArgs(settings).forEach { request.addOption(it) }

            if (job.kind == "mp3") {
                request
                    .addOption("-f", "ba[ext=m4a]/ba[ext=mp4]/ba/b")
                    .addOption("-x")
                    .addOption("--audio-format", "mp3")
                    .addOption("--audio-quality", "${job.bitrate ?: 192}K")
            } else {
                if (quality == null) throw ApiException("NO_VIDEO_FORMAT", "No video quality was selected.", 422)
                request
                    .addOption("-f", formatSelector(quality, settings.preferH264))
                    .addOption("--merge-output-format", "mp4")
            }

            job.range?.let { range ->
                request.addOption(
                    "--download-sections",
                    "*${formatSectionTimestamp(range.start)}-${formatSectionTimestamp(range.end)}",
                )
                if (job.precise && job.kind != "mp3") request.addOption("--force-keyframes-at-cuts")
            }

            var lastEmit = 0L
            var lastStage = "downloading"
            val sectionSeconds = job.range?.let { it.end - it.start } ?: job.duration
            val response = YoutubeDL.getInstance().execute(request, processId, true) { progress, eta, line ->
                val stage = when {
                    line.contains("[Merger]") -> "merging"
                    line.contains("[ExtractAudio]") -> "converting"
                    else -> lastStage
                }
                if (stage != lastStage) {
                    lastStage = stage
                    onStage(stage)
                }
                val parsedPercent = Regex("\\[download\\]\\s+(\\d+(?:\\.\\d+)?)%")
                    .find(line)?.groupValues?.get(1)?.toDoubleOrNull()
                val ffmpegSeconds = Regex("out_time_us=(\\d+)")
                    .find(line)?.groupValues?.get(1)?.toLongOrNull()?.div(1_000_000.0)
                val ffmpegPercent = if (ffmpegSeconds != null && sectionSeconds != null && sectionSeconds > 0) {
                    (ffmpegSeconds / sectionSeconds * 100).coerceIn(0.0, 100.0)
                } else {
                    null
                }
                val effectivePercent = when {
                    progress >= 0 -> progress.toDouble()
                    parsedPercent != null -> parsedPercent
                    else -> ffmpegPercent
                }
                val parsedEta = Regex("ETA\\s+(\\d+):(\\d+)").find(line)?.let { match ->
                    val minutes = match.groupValues[1].toLongOrNull() ?: 0L
                    val seconds = match.groupValues[2].toLongOrNull() ?: 0L
                    minutes * 60 + seconds
                } ?: eta
                val now = System.currentTimeMillis()
                if (now - lastEmit >= 250 || (effectivePercent ?: 0.0) >= 100) {
                    lastEmit = now
                    onProgress(buildProgress(effectivePercent, parsedEta, line, stage))
                }
            }

            if (handle.cancelled) throw DownloadCancelled()
            if (response.exitCode != 0) {
                throw mapYtDlpError(response.err.ifBlank { response.out })
            }

            val ext = if (job.kind == "mp3") "mp3" else "mp4"
            val source = newestFile(tempDir, base, ext)
                ?: throw ApiException("OUTPUT_MISSING", "The download finished, but no output file was found.", 500)

            var mp3Source: File? = null
            if (job.kind == "both") {
                onStage("converting")
                onProgress(indeterminate("Extracting MP3 from the downloaded section"))
                val mp3 = File(tempDir, "$base.mp3")
                extractMp3(source, mp3, job.bitrate ?: 192, handle)
                mp3Source = mp3
            }

            if (handle.cancelled) throw DownloadCancelled()
            onStage("finalizing")

            val videoName = "$base.$ext"
            val videoFile = File(jobDownloads, videoName)
            source.copyTo(videoFile, overwrite = true)
            source.delete()

            val duration = job.range?.let { it.end - it.start } ?: job.duration ?: readDuration(videoFile)
            val video = DownloadedFile(
                filename = videoName,
                size = videoFile.length(),
                duration = duration,
                mime = if (job.kind == "mp3") "audio/mpeg" else "video/mp4",
            )

            val audio = mp3Source?.let { mp3 ->
                val audioName = "$base.mp3"
                val audioFile = File(jobDownloads, audioName)
                mp3.copyTo(audioFile, overwrite = true)
                mp3.delete()
                DownloadedFile(
                    filename = audioName,
                    size = audioFile.length(),
                    duration = duration ?: readDuration(audioFile),
                    mime = "audio/mpeg",
                )
            }

            tempDir.deleteRecursively()
            DownloadResult(video, audio)
        } catch (error: Throwable) {
            tempDir.deleteRecursively()
            throw error
        }
    }

    private fun newestFile(dir: File, base: String, ext: String): File? =
        dir.listFiles { file ->
            file.isFile &&
                file.name.startsWith(base) &&
                file.extension.equals(ext, ignoreCase = true) &&
                !file.name.endsWith(".part")
        }?.maxByOrNull { it.length() }

    private fun extractMp3(input: File, output: File, bitrate: Int, handle: DownloadHandle) {
        val ffmpeg = File(context.applicationInfo.nativeLibraryDir, "libffmpeg.so")
        val process = ProcessBuilder(
            ffmpeg.absolutePath,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            input.absolutePath,
            "-vn",
            "-map_metadata",
            "0",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "${bitrate}k",
            "-ac",
            "2",
            "-id3v2_version",
            "3",
            "-nostats",
            output.absolutePath,
        ).redirectErrorStream(true).apply {
            environment().putAll(ffmpegEnvironment())
        }.start()

        handle.ffmpeg = process
        val text = process.inputStream.bufferedReader().readText()
        val finished = process.waitFor(10, TimeUnit.MINUTES)
        handle.ffmpeg = null
        if (!finished) {
            process.destroy()
            throw ApiException("MP3_TIMEOUT", "MP3 conversion took too long and was stopped.", 500)
        }
        if (handle.cancelled) throw DownloadCancelled()
        if (process.exitValue() != 0) {
            throw ApiException(
                "MP3_CONVERSION_FAILED",
                "The MP4 downloaded, but MP3 conversion failed.",
                500,
                text.takeLast(2000),
            )
        }
    }

    private fun readDuration(file: File): Double? {
        val ffmpeg = File(context.applicationInfo.nativeLibraryDir, "libffmpeg.so")
        return runCatching {
            val process = ProcessBuilder(
                ffmpeg.absolutePath,
                "-hide_banner",
                "-i",
                file.absolutePath,
            ).redirectErrorStream(true).apply {
                environment().putAll(ffmpegEnvironment())
            }.start()
            val text = process.inputStream.bufferedReader().readText()
            process.waitFor(30, TimeUnit.SECONDS)
            val match = Regex("Duration:\\s*(\\d+):(\\d+):(\\d+(?:\\.\\d+)?)").find(text)
                ?: return null
            val (hours, minutes, seconds) = match.destructured
            hours.toDouble() * 3600 + minutes.toDouble() * 60 + seconds.toDouble()
        }.getOrNull()
    }

    private fun buildProgress(progress: Double?, eta: Long, line: String, stage: String): JobProgress {
        val percent = progress?.coerceIn(0.0, 100.0)
        val totalMatch = Regex("of\\s+~?\\s*([\\d.]+)\\s*([KMGT]?)iB").find(line)
        val totalBytes = totalMatch?.let {
            toBytes(it.groupValues[1].toDoubleOrNull(), it.groupValues[2])
        }
        val ffmpegSize = Regex("size=\\s*(\\d+)\\s*kB").find(line)
            ?.groupValues?.get(1)?.toLongOrNull()?.times(1024)
        val speedMatch = Regex("at\\s+([\\d.]+)\\s*([KMGT]?)iB/s").find(line)
        val speed = speedMatch?.let {
            toBytes(it.groupValues[1].toDoubleOrNull(), it.groupValues[2])?.toDouble()
        }
        val downloaded = ffmpegSize ?: if (totalBytes != null && percent != null) {
            (totalBytes * percent / 100).roundToLong()
        } else {
            0L
        }
        return JobProgress(
            percent = percent,
            downloadedBytes = downloaded,
            totalBytes = totalBytes,
            speed = speed,
            eta = eta.takeIf { it > 0 }?.toDouble(),
            detail = stageLabel(stage),
        )
    }

    private fun indeterminate(detail: String): JobProgress = JobProgress(
        percent = null,
        downloadedBytes = 0,
        totalBytes = null,
        speed = null,
        eta = null,
        detail = detail,
    )

    private fun stageLabel(stage: String): String = when (stage) {
        "downloading" -> "Downloading"
        "merging" -> "Merging audio and video"
        "converting" -> "Converting to MP3"
        "finalizing" -> "Finalizing"
        else -> "Working"
    }

    private fun toBytes(value: Double?, unit: String): Long? {
        if (value == null) return null
        val power = when (unit) {
            "K" -> 1
            "M" -> 2
            "G" -> 3
            "T" -> 4
            else -> 0
        }
        return (value * 1024.0.pow(power)).roundToLong()
    }

    private fun ffmpegEnvironment(): Map<String, String> {
        val nativeDir = context.applicationInfo.nativeLibraryDir
        val ffmpegLib = File(context.noBackupFilesDir, "youtubedl-android/packages/ffmpeg/usr/lib")
        val pythonLib = File(context.noBackupFilesDir, "youtubedl-android/packages/python/usr/lib")
        val libraryPath = listOf(ffmpegLib.absolutePath, pythonLib.absolutePath, nativeDir).joinToString(":")
        val path = System.getenv("PATH").orEmpty()
        return mapOf(
            "LD_LIBRARY_PATH" to libraryPath,
            "PATH" to if (path.isBlank()) nativeDir else "$nativeDir:$path",
        )
    }
}
