package com.clipshed.app.server

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File

class SettingsStore(private val context: Context) {
    private val file = File(context.filesDir, "settings.json")
    private val cookiesFile = File(context.filesDir, "cookies.txt")
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; prettyPrint = true }
    private val mutex = Mutex()
    private var cached: Settings? = null

    private val validModes = setOf("none", "file", "browser")
    private val validBrowsers =
        setOf("chrome", "edge", "firefox", "brave", "chromium", "opera", "vivaldi")

    suspend fun get(): Settings = mutex.withLock {
        cached ?: load().also { cached = it }
    }

    suspend fun update(patch: SettingsUpdate): Settings = mutex.withLock {
        val current = cached ?: load()
        val next = current.copy(
            cookiesMode = patch.cookiesMode?.takeIf { it in validModes } ?: current.cookiesMode,
            cookiesBrowser = patch.cookiesBrowser?.takeIf { it in validBrowsers } ?: current.cookiesBrowser,
            cookiesFile = patch.cookiesFile?.take(4096) ?: current.cookiesFile,
            preferH264 = patch.preferH264 ?: current.preferH264,
        )
        save(next)
        cached = next
        next
    }

    suspend fun importCookies(filename: String, content: String): Settings = mutex.withLock {
        val safeName = sanitizeFilename(filename.ifBlank { "cookies.txt" }, "cookies.txt")
        val target = if (safeName.endsWith(".txt", ignoreCase = true)) cookiesFile else cookiesFile
        withContext(Dispatchers.IO) {
            target.writeText(content, Charsets.UTF_8)
        }
        val current = cached ?: load()
        val next = current.copy(cookiesMode = "file", cookiesFile = target.absolutePath)
        save(next)
        cached = next
        next
    }

    fun resolveCookiesFile(settings: Settings): File? {
        val value = settings.cookiesFile.trim()
        if (value.isEmpty()) return null
        val candidate = File(value)
        val resolved = if (candidate.isAbsolute) candidate else File(context.filesDir, value)
        return resolved.takeIf { it.isFile }
    }

    fun cookiesArgs(settings: Settings): List<String> {
        if (settings.cookiesMode != "file") return emptyList()
        val file = resolveCookiesFile(settings) ?: return emptyList()
        return listOf("--cookies", file.absolutePath)
    }

    fun isCookiesConfigured(settings: Settings): Boolean {
        if (settings.cookiesMode == "browser") return false
        return settings.cookiesMode == "file" && resolveCookiesFile(settings) != null
    }

    private suspend fun load(): Settings = withContext(Dispatchers.IO) {
        if (!file.isFile) return@withContext Settings()
        runCatching {
            json.decodeFromString<Settings>(file.readText(Charsets.UTF_8))
        }.getOrElse { Settings() }
    }

    private suspend fun save(settings: Settings) = withContext(Dispatchers.IO) {
        file.parentFile?.mkdirs()
        val temp = File(file.parentFile, "${file.name}.tmp")
        temp.writeText(json.encodeToString(settings), Charsets.UTF_8)
        if (!temp.renameTo(file)) {
            file.delete()
            temp.renameTo(file)
        }
    }
}
