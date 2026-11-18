package com.clipshed.app.server

import android.app.Application as AndroidApplication
import android.os.Build
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import io.ktor.http.ContentDisposition
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application as KtorApplication
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.install
import io.ktor.server.cio.CIO
import io.ktor.server.engine.embeddedServer
import io.ktor.server.http.content.staticFiles
import io.ktor.server.plugins.BadRequestException
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.request.receive
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondFile
import io.ktor.server.response.respondText
import io.ktor.server.response.respondTextWriter
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File

object ServerHost {
    const val PORT = 43123

    lateinit var context: AndroidApplication
        private set
    lateinit var settings: SettingsStore
        private set
    lateinit var probe: ProbeService
        private set
    lateinit var downloader: Downloader
        private set
    lateinit var jobs: JobManager
        private set
    lateinit var updates: Updates
        private set

    lateinit var webDir: File
        private set

    val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        explicitNulls = true
        isLenient = true
    }

    val ready = CompletableDeferred<Unit>()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun start(application: AndroidApplication) {
        context = application
        webDir = File(application.filesDir, "web")
        copyWebAssets()

        settings = SettingsStore(application)
        probe = ProbeService(scope, settings)
        downloader = Downloader(application, settings)
        jobs = JobManager(application, settings, probe, downloader, scope)
        updates = Updates(application)

        scope.launch { jobs.start() }

        embeddedServer(CIO, port = PORT, host = "127.0.0.1") {
            module()
        }.start(wait = false)

        scope.launch {
            try {
                YoutubeDL.getInstance().init(application)
                FFmpeg.getInstance().init(application)
                if (YoutubeDL.version(application) == null) {
                    runCatching {
                        YoutubeDL.getInstance().updateYoutubeDL(application, YoutubeDL.UpdateChannel.STABLE)
                    }
                }
            } catch (_: Throwable) {
                // Keep the server alive; the UI shows the missing binary state.
            } finally {
                ready.complete(Unit)
            }
        }
    }

    suspend fun awaitReady() {
        ready.await()
    }

    suspend fun health(): Health {
        val currentSettings = settings.get()
        val isReady = ready.isCompleted
        val version = runCatching { YoutubeDL.version(context) }.getOrNull()
        return Health(
            ok = isReady,
            appVersion = updates.appVersion(),
            ytdlpVersion = version ?: if (isReady) "bundled" else null,
            ffmpegVersion = "bundled",
            nodeVersion = "Android ${Build.VERSION.RELEASE}",
            binariesOk = isReady,
            cookiesConfigured = settings.isCookiesConfigured(currentSettings),
        )
    }

    private fun copyWebAssets() {
        webDir.deleteRecursively()
        webDir.mkdirs()
        copyAssetDir("web", webDir)
    }

    private fun copyAssetDir(assetPath: String, target: File) {
        val children = runCatching { context.assets.list(assetPath) }.getOrNull() ?: return
        if (children.isEmpty()) {
            runCatching {
                context.assets.open(assetPath).use { input ->
                    target.parentFile?.mkdirs()
                    target.outputStream().use { output -> input.copyTo(output) }
                }
            }
            return
        }

        target.mkdirs()
        for (child in children) copyAssetDir("$assetPath/$child", File(target, child))
    }
}

private suspend fun ApplicationCall.respondError(error: ApiException) {
    val payload = ApiErrorPayload(ApiErrorBody(error.code, error.message, error.details))
    respondText(
        ServerHost.json.encodeToString(payload),
        ContentType.Application.Json,
        HttpStatusCode.fromValue(error.statusCode),
    )
}

fun KtorApplication.module() {
    install(ContentNegotiation) {
        json(ServerHost.json)
    }
    install(StatusPages) {
        exception<ApiException> { call, cause -> call.respondError(cause) }
        exception<SerializationException> { call, cause ->
            call.respondError(ApiException("VALIDATION", "The request body wasn't valid.", 400, cause.message))
        }
        exception<BadRequestException> { call, cause ->
            call.respondError(ApiException("VALIDATION", cause.message ?: "The request body wasn't valid.", 400))
        }
        exception<Throwable> { call, cause ->
            call.respondError(
                ApiException(
                    "INTERNAL",
                    "Something went wrong on the server.",
                    500,
                    cause.message ?: cause.toString(),
                ),
            )
        }
    }

    routing {
        route("/api") {
            get("/health") {
                call.respond(ServerHost.health())
            }

            post("/probe") {
                val body = call.receive<ProbeRequest>()
                val resolved = resolveMediaUrl(body.url)
                val source = resolved.source
                if (!resolved.ok || source == null) {
                    throw ApiException("INVALID_URL", resolved.error ?: "That URL isn't supported.")
                }
                ServerHost.awaitReady()
                val result = ServerHost.probe.probe(source, ServerHost.settings.get())
                call.respond(result.copy(suggestedStart = source.startAt))
            }

            get("/settings") {
                call.respond(
                    SettingsPayload(
                        settings = ServerHost.settings.get(),
                        health = ServerHost.health(),
                    ),
                )
            }

            put("/settings") {
                val patch = call.receive<SettingsUpdate>()
                val updated = ServerHost.settings.update(patch)
                call.respond(SettingsPayload(updated, ServerHost.health()))
            }

            post("/settings/cookies") {
                val body = call.receive<CookiesImport>()
                val updated = ServerHost.settings.importCookies(body.filename, body.content)
                call.respond(SettingsPayload(updated, ServerHost.health()))
            }

            get("/jobs") {
                call.respond(JobsPayload(ServerHost.jobs.listJobs()))
            }

            post("/jobs") {
                val body = call.receive<JobRequest>()
                ServerHost.awaitReady()
                call.respond(HttpStatusCode.Created, ServerHost.jobs.createJob(body))
            }

            get("/jobs/{id}") {
                val id = call.parameters["id"] ?: throw ApiException("JOB_NOT_FOUND", "That job doesn't exist.", 404)
                val job = ServerHost.jobs.getJob(id)
                    ?: throw ApiException("JOB_NOT_FOUND", "That job doesn't exist.", 404)
                call.respond(job)
            }

            get("/jobs/{id}/events") {
                val id = call.parameters["id"] ?: throw ApiException("JOB_NOT_FOUND", "That job doesn't exist.", 404)
                val snapshot = ServerHost.jobs.getJob(id)
                    ?: throw ApiException("JOB_NOT_FOUND", "That job doesn't exist.", 404)

                call.respondTextWriter(ContentType.Text.EventStream) {
                    write("data: ${ServerHost.json.encodeToString(JobEvent("snapshot", snapshot))}\n\n")
                    flush()

                    coroutineScope {
                        val heartbeat = launch {
                            while (isActive) {
                                delay(15_000)
                                write(": ping\n\n")
                                flush()
                            }
                        }
                        try {
                            ServerHost.jobs.eventsFor(id).collect { event ->
                                write("data: ${ServerHost.json.encodeToString(event)}\n\n")
                                flush()
                            }
                        } finally {
                            heartbeat.cancel()
                        }
                    }
                }
            }

            post("/jobs/{id}/cancel") {
                val id = call.parameters["id"] ?: throw ApiException("JOB_NOT_FOUND", "That job doesn't exist.", 404)
                call.respond(ServerHost.jobs.cancelJob(id))
            }

            get("/jobs/{id}/file") {
                val id = call.parameters["id"] ?: throw ApiException("JOB_NOT_FOUND", "That job doesn't exist.", 404)
                val job = ServerHost.jobs.getJob(id)
                    ?: throw ApiException("JOB_NOT_FOUND", "That job doesn't exist.", 404)
                if (job.status != "completed") {
                    throw ApiException("FILE_NOT_READY", "That file isn't ready or no longer exists.", 404)
                }

                val kind = call.request.queryParameters["kind"] ?: "mp4"
                val mime = if (kind == "mp3") "audio/mpeg" else "video/mp4"
                val output = listOfNotNull(job.output, job.audioOutput).firstOrNull { it.mime == mime }
                    ?: throw ApiException("FILE_NOT_READY", "That output isn't available for this job.", 404)

                val jobDir = File(File(ServerHost.context.filesDir, "downloads"), job.id).canonicalFile
                val file = File(jobDir, output.filename).canonicalFile
                if (!file.path.startsWith(jobDir.path) || !file.isFile) {
                    throw ApiException("FILE_MISSING", "The file has been cleaned up or deleted.", 410)
                }

                call.response.header(
                    HttpHeaders.ContentDisposition,
                    ContentDisposition.Attachment
                        .withParameter(ContentDisposition.Parameters.FileName, output.filename)
                        .toString(),
                )
                call.respondFile(file)
            }

            post("/jobs/{id}/save") {
                val id = call.parameters["id"] ?: throw ApiException("JOB_NOT_FOUND", "That job doesn't exist.", 404)
                val body = call.receive<SaveRequest>()
                call.respond(ServerHost.jobs.saveOutput(id, body.kind))
            }

            delete("/jobs/{id}") {
                val id = call.parameters["id"] ?: throw ApiException("JOB_NOT_FOUND", "That job doesn't exist.", 404)
                ServerHost.jobs.deleteJob(id)
                call.respond(HttpStatusCode.NoContent)
            }

            post("/ytdlp/update") {
                ServerHost.awaitReady()
                val result = withContext(Dispatchers.IO) {
                    runCatching {
                        YoutubeDL.getInstance().updateYoutubeDL(
                            ServerHost.context,
                            YoutubeDL.UpdateChannel.STABLE,
                        )
                    }
                }
                val output = result.fold(
                    onSuccess = {
                        "yt-dlp updated${YoutubeDL.version(ServerHost.context)?.let { version -> " to $version" } ?: ""}."
                    },
                    onFailure = { it.message ?: "Update failed." },
                )
                call.respond(UpdateResult(result.isSuccess, output, ServerHost.health()))
            }

            get("/updates/check") {
                call.respond(ServerHost.updates.check())
            }
        }

        get("/") {
            val index = File(ServerHost.webDir, "index.html")
            if (!index.isFile) {
                throw ApiException("UI_MISSING", "The web UI isn't bundled in this build.", 500)
            }
            call.respondFile(index)
        }
        staticFiles("/", ServerHost.webDir)
    }
}
