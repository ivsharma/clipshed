package com.clipshed.app.server

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job as CoroutineJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong

class JobManager(
    private val context: Context,
    private val settingsStore: SettingsStore,
    private val probeService: ProbeService,
    private val downloader: Downloader,
    private val scope: CoroutineScope,
) {
    companion object {
        private const val DEFAULT_BITRATE = 192
        private const val HISTORY_LIMIT = 100
        private const val MAX_VIDEO_SECONDS = 6 * 60 * 60
        private const val JOB_TTL_MS = 24L * 60 * 60 * 1000
        private val JOB_ID = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", RegexOption.IGNORE_CASE)
        private val ACTIVE = setOf("queued", "resolving", "running")
        private val TERMINAL = setOf("completed", "failed", "cancelled")
    }

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }
    private val jobs = ConcurrentHashMap<String, Job>()
    private val queue = Channel<String>(Channel.UNLIMITED)
    private val eventFlow = MutableSharedFlow<JobEvent>(
        extraBufferCapacity = 128,
        onBufferOverflow = kotlinx.coroutines.channels.BufferOverflow.DROP_OLDEST,
    )
    private val events: SharedFlow<JobEvent> = eventFlow.asSharedFlow()
    private val cancelRequested = ConcurrentHashMap.newKeySet<String>()
    private val active = ConcurrentHashMap<String, DownloadHandle>()
    private val stateLock = Any()
    private val saveMutex = Mutex()
    private val pendingJobs = AtomicInteger(0)
    private var lastNotifiedAt = 0L

    private val historyFile = File(context.filesDir, "jobs.json")
    private val downloadsDir = File(context.filesDir, "downloads")
    private val tempDir = File(context.filesDir, "tmp")

    private var started = false
    private var worker: CoroutineJob? = null

    suspend fun start() {
        if (started) return
        started = true
        loadHistory()
        worker = scope.launch {
            for (id in queue) {
                val job = jobs[id] ?: continue
                if (cancelRequested.contains(id)) {
                    markCancelled(job)
                    continue
                }
                runJob(job)
            }
        }
        scope.launch {
            cleanup()
            while (isActive) {
                delay(60 * 60 * 1000)
                cleanup()
            }
        }
    }

    suspend fun createJob(request: JobRequest): Job {
        if (request.kind !in setOf("mp4", "mp3", "both")) {
            throw ApiException("VALIDATION", "Pick MP4, MP3, or Both.")
        }
        val resolved = resolveMediaUrl(request.url)
        val source = resolved.source
        if (!resolved.ok || source == null) {
            throw ApiException("INVALID_URL", resolved.error ?: "That URL isn't supported.")
        }

        val settings = settingsStore.get()
        val probe = probeService.probe(source, settings)
        if (probe.isLive) {
            throw ApiException(
                "LIVE_UNSUPPORTED",
                "Active live streams aren't supported. Try again after the stream ends.",
            )
        }

        val quality = if (request.kind == "mp3") null else chooseQuality(probe, request.height)
        val job = Job(
            id = UUID.randomUUID().toString(),
            url = source.url,
            platform = source.platform,
            mediaId = source.mediaId,
            title = probe.title,
            uploader = probe.uploader,
            thumbnail = probe.thumbnail,
            duration = probe.duration,
            kind = request.kind,
            height = quality?.height,
            bitrate = if (request.kind == "mp4") null else (request.bitrate ?: DEFAULT_BITRATE),
            range = validateRange(request.range, probe.duration),
            precise = request.precise,
            status = "queued",
            stage = "queued",
            progress = initialProgress(),
            createdAt = System.currentTimeMillis(),
        )

        jobs[job.id] = job
        pendingJobs.incrementAndGet()
        DownloadService.start(context, "Preparing ${job.title}")
        persist()
        emit(job, "update")
        queue.trySend(job.id)
        return snapshot(job)
    }

    fun getJob(id: String): Job? {
        if (!JOB_ID.matches(id)) return null
        return jobs[id]?.let(::snapshot)
    }

    fun listJobs(): List<Job> = jobs.values
        .sortedByDescending { it.createdAt }
        .take(50)
        .map(::snapshot)

    fun eventsFor(id: String): Flow<JobEvent> = events.filter { it.job.id == id }

    suspend fun cancelJob(id: String): Job {
        val job = requireJob(id)
        if (job.status in TERMINAL) return snapshot(job)

        cancelRequested.add(id)
        if (job.status == "queued") {
            markCancelled(job)
        } else {
            synchronized(stateLock) {
                job.stage = "cancelling"
                job.progress = job.progress.copy(detail = "Cancelling")
            }
            emit(job, "update")
            withContext(Dispatchers.IO) { active[id]?.cancel() }
        }
        return snapshot(job)
    }

    suspend fun deleteJob(id: String) {
        val job = requireJob(id)
        if (job.status !in TERMINAL) {
            throw ApiException("JOB_ACTIVE", "Cancel the job before deleting it.", 409)
        }
        jobs.remove(id)
        persist()
        removeDir(tempDir, id)
        removeDir(downloadsDir, id)
    }

    suspend fun saveOutput(id: String, kind: String): SaveResult {
        val job = requireJob(id)
        if (job.status != "completed") {
            throw ApiException("FILE_NOT_READY", "That file isn't ready or no longer exists.", 404)
        }
        val output = listOfNotNull(job.output, job.audioOutput).firstOrNull {
            if (kind == "mp3") it.mime == "audio/mpeg" else it.mime == "video/mp4"
        } ?: throw ApiException("FILE_NOT_READY", "That output isn't available for this job.", 404)

        val file = File(File(downloadsDir, job.id), output.filename)
        if (!file.isFile) throw ApiException("FILE_MISSING", "The file has been cleaned up or deleted.", 410)
        return withContext(Dispatchers.IO) { MediaStoreSaver.save(context, file, output.mime) }
    }

    suspend fun shutdown() {
        withContext(Dispatchers.IO) { active.values.forEach { it.cancel() } }
        persist()
        worker?.cancel()
        pendingJobs.set(0)
        DownloadService.stop(context)
    }

    private suspend fun runJob(job: Job) {
        val id = job.id
        try {
            if (cancelRequested.contains(id)) {
                markCancelled(job)
                return
            }

            setState(job, "resolving", "resolving", "Reading video")
            val settings = settingsStore.get()
            val probe = probeService.probe(sourceOf(job), settings)
            if (cancelRequested.contains(id)) {
                markCancelled(job)
                return
            }
            if (probe.isLive) {
                throw ApiException(
                    "LIVE_UNSUPPORTED",
                    "This stream went live and can't be downloaded until it ends.",
                )
            }

            applyProbe(job, probe)
            val quality = if (job.kind == "mp3") null else chooseQuality(probe, job.height)
            job.height = quality?.height

            setState(job, "running", "downloading", "Downloading")
            job.startedAt = System.currentTimeMillis()

            val result = downloader.download(
                job = job,
                quality = quality,
                settings = settings,
                onProgress = { progress -> onProgress(job, progress) },
                onStage = { stage -> onStage(job, stage) },
                onHandle = { handle ->
                    active[id] = handle
                    if (cancelRequested.contains(id)) handle.cancel()
                },
            )

            if (cancelRequested.contains(id)) {
                markCancelled(job)
            } else {
                markCompleted(job, result)
            }
        } catch (_: DownloadCancelled) {
            markCancelled(job)
        } catch (error: ApiException) {
            if (cancelRequested.contains(id)) markCancelled(job) else markFailed(job, error)
        } catch (error: Throwable) {
            if (cancelRequested.contains(id)) {
                markCancelled(job)
            } else {
                markFailed(
                    job,
                    ApiException(
                        "DOWNLOAD_FAILED",
                        "The download failed.",
                        500,
                        error.message ?: error.toString(),
                    ),
                )
            }
        } finally {
            active.remove(id)
            cancelRequested.remove(id)
        }
    }

    private fun applyProbe(job: Job, probe: ProbeResult) {
        job.range = validateRange(job.range, probe.duration)
        job.title = probe.title
        job.uploader = probe.uploader
        job.thumbnail = probe.thumbnail
        job.duration = probe.duration
    }

    private fun onProgress(job: Job, progress: JobProgress) {
        val emit = synchronized(stateLock) {
            if (job.status != "running") return
            job.progress = progress
            true
        }
        if (emit) {
            emit(job, "update")
            val now = System.currentTimeMillis()
            if (now - lastNotifiedAt >= 1000) {
                lastNotifiedAt = now
                DownloadService.update(context, job.title, progress.percent?.toInt() ?: -1)
            }
        }
    }

    private fun onStage(job: Job, stage: String) {
        val emit = synchronized(stateLock) {
            if (job.status != "running") return
            job.stage = stage
            true
        }
        if (emit) emit(job, "update")
    }

    private suspend fun markCompleted(job: Job, result: DownloadResult) {
        synchronized(stateLock) {
            job.status = "completed"
            job.stage = "done"
            job.progress = JobProgress(
                percent = 100.0,
                downloadedBytes = result.video.size,
                totalBytes = result.video.size,
                speed = null,
                eta = 0.0,
                detail = "Done",
            )
            job.output = toJobOutput(job.id, result.video, if (job.kind == "mp3") "mp3" else "mp4")
            job.audioOutput = result.audio?.let { toJobOutput(job.id, it, "mp3") }
            job.error = null
            job.finishedAt = System.currentTimeMillis()
        }
        emit(job, "done")
        persist()
        finishNotification()
    }

    private suspend fun markFailed(job: Job, error: ApiException) {
        synchronized(stateLock) {
            job.status = "failed"
            job.stage = "done"
            job.error = JobError(error.code, error.message, error.details)
            job.progress = job.progress.copy(detail = "Failed")
            job.finishedAt = System.currentTimeMillis()
        }
        emit(job, "error")
        persist()
        finishNotification()
    }

    private suspend fun markCancelled(job: Job) {
        if (job.status in TERMINAL) return
        synchronized(stateLock) {
            job.status = "cancelled"
            job.stage = "done"
            job.progress = job.progress.copy(detail = "Cancelled", eta = 0.0)
            job.finishedAt = System.currentTimeMillis()
        }
        emit(job, "update")
        persist()
        removeDir(tempDir, job.id)
        removeDir(downloadsDir, job.id)
        finishNotification()
    }

    private fun setState(job: Job, status: String, stage: String, detail: String) {
        synchronized(stateLock) {
            job.status = status
            job.stage = stage
            job.progress = job.progress.copy(detail = detail)
        }
        emit(job, "update")
    }

    private fun toJobOutput(id: String, file: DownloadedFile, kind: String): JobOutput = JobOutput(
        filename = file.filename,
        size = file.size,
        duration = file.duration,
        mime = file.mime,
        downloadUrl = "/api/jobs/$id/file?kind=$kind",
    )

    private fun initialProgress(): JobProgress = JobProgress(
        percent = null,
        downloadedBytes = 0,
        totalBytes = null,
        speed = null,
        eta = null,
        detail = "Queued",
    )

    private fun sourceOf(job: Job): MediaSource = MediaSource(
        platform = job.platform,
        mediaId = job.mediaId,
        url = job.url,
        startAt = null,
    )

    private fun requireJob(id: String): Job {
        val job = if (JOB_ID.matches(id)) jobs[id] else null
        if (job == null) throw ApiException("JOB_NOT_FOUND", "That job doesn't exist.", 404)
        return job
    }

    private fun snapshot(job: Job): Job = synchronized(stateLock) {
        job.copy(progress = job.progress.copy())
    }

    private fun finishNotification() {
        val remaining = pendingJobs.decrementAndGet()
        if (remaining <= 0) {
            pendingJobs.set(0)
            DownloadService.stop(context)
        }
    }

    private fun emit(job: Job, type: String) {
        eventFlow.tryEmit(JobEvent(type, snapshot(job)))
    }

    private suspend fun loadHistory() = withContext(Dispatchers.IO) {
        if (!historyFile.isFile) return@withContext
        val loaded = runCatching {
            json.decodeFromString<List<Job>>(historyFile.readText(Charsets.UTF_8))
        }.getOrElse { emptyList() }

        for (raw in loaded.take(HISTORY_LIMIT)) {
            val job = if (raw.status in ACTIVE) {
                raw.copy(
                    status = "failed",
                    stage = "done",
                    error = JobError("INTERRUPTED", "The app restarted before this job finished."),
                    finishedAt = System.currentTimeMillis(),
                )
            } else {
                raw
            }
            jobs[job.id] = job
        }
    }

    private suspend fun persist() {
        saveMutex.withLock {
            withContext(Dispatchers.IO) {
                val snapshot = synchronized(stateLock) {
                    jobs.values
                        .sortedByDescending { it.createdAt }
                        .take(HISTORY_LIMIT)
                        .map { it.copy(progress = it.progress.copy()) }
                }
                historyFile.parentFile?.mkdirs()
                val temp = File(historyFile.parentFile, "${historyFile.name}.tmp")
                temp.writeText(json.encodeToString(snapshot), Charsets.UTF_8)
                if (!temp.renameTo(historyFile)) {
                    historyFile.delete()
                    temp.renameTo(historyFile)
                }
            }
        }
    }

    private suspend fun cleanup() {
        val cutoff = System.currentTimeMillis() - JOB_TTL_MS
        var changed = false

        for ((id, job) in jobs) {
            if (job.status !in TERMINAL) continue
            removeDir(tempDir, id)
            val finishedAt = job.finishedAt
            if (finishedAt != null && finishedAt < cutoff) {
                jobs.remove(id)
                removeDir(downloadsDir, id)
                changed = true
            }
        }

        removeStrayDirs(tempDir) { id -> jobs[id]?.let { it.status in TERMINAL } ?: true }
        removeStrayDirs(downloadsDir) { id -> jobs[id] == null }
        if (changed) persist()
    }

    private suspend fun removeStrayDirs(root: File, shouldRemove: (String) -> Boolean) {
        val entries = withContext(Dispatchers.IO) { root.listFiles() ?: emptyArray() }
        for (entry in entries) {
            if (entry.isDirectory && shouldRemove(entry.name)) removeDir(root, entry.name)
        }
    }

    private suspend fun removeDir(root: File, name: String) {
        val safeName = File(name).name
        if (!JOB_ID.matches(safeName)) return
        withContext(Dispatchers.IO) {
            File(root, safeName).deleteRecursively()
        }
    }

    private fun validateRange(range: Range?, duration: Double?): Range? {
        if (range == null) {
            if (duration != null && duration > MAX_VIDEO_SECONDS) {
                throw ApiException(
                    "DURATION_TOO_LONG",
                    "This video is longer than 6 hours. Use a custom range instead.",
                )
            }
            return null
        }

        if (duration == null) {
            throw ApiException(
                "RANGE_UNAVAILABLE",
                "This video doesn't report a duration, so a time range can't be used.",
            )
        }
        if (range.end - range.start < 1) throw ApiException("INVALID_RANGE", "Select at least one second.")
        if (range.start >= duration - 0.5) {
            throw ApiException("INVALID_RANGE", "The start time is at or past the end of the video.")
        }
        if (range.end > duration + 1) {
            throw ApiException("INVALID_RANGE", "The end time is past the end of the video.")
        }
        if (range.end - range.start > MAX_VIDEO_SECONDS) {
            throw ApiException("DURATION_TOO_LONG", "That range is longer than 6 hours. Pick a shorter range.")
        }

        val start = max(0.0, (range.start * 1000).roundToLong() / 1000.0)
        val end = min(duration, (range.end * 1000).roundToLong() / 1000.0)
        if (end - start < 1) throw ApiException("INVALID_RANGE", "Select at least one second.")
        return Range(start, end)
    }
}
