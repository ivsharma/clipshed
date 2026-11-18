package com.clipshed.spike

import android.app.Activity
import android.content.ContentValues
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.text.InputType
import android.text.method.ScrollingMovementMethod
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import java.io.File
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Phase 0 spike: prove that youtubedl-android 0.18.1 can probe, range-download,
 * convert to MP3, use QuickJS, and publish files to the public Downloads folder.
 */
class MainActivity : Activity() {
    private lateinit var urlInput: EditText
    private lateinit var statusView: TextView
    private lateinit var progressBar: ProgressBar
    private lateinit var logView: TextView

    private val buttons = mutableListOf<Button>()
    private val executor = Executors.newSingleThreadExecutor()
    private val busy = AtomicBoolean(true)
    private val logLines = ArrayDeque<String>()
    private val timeFormat = SimpleDateFormat("HH:mm:ss", Locale.US)

    private var lastProgress = -2f
    private var lastProgressAt = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(buildUi())
        setBusy(true)

        log("device=${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
        log("initializing youtubedl-android…")

        executor.execute {
            try {
                YoutubeDL.getInstance().init(applicationContext)
                FFmpeg.getInstance().init(applicationContext)
                val version = YoutubeDL.version(applicationContext)
                ui {
                    log("ready · yt-dlp $version")
                    statusView.text = "Ready"
                    setBusy(false)
                }
            } catch (error: Exception) {
                ui {
                    log("init failed: ${error.message}")
                    statusView.text = "Initialization failed"
                }
            }
        }
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun buildUi(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(16))
            setBackgroundColor(Color.WHITE)
        }

        root.addView(TextView(this).apply {
            text = "Clipshed Android spike"
            textSize = 22f
            setTypeface(typeface, Typeface.BOLD)
        })

        root.addView(TextView(this).apply {
            text = "10-second range downloads through youtubedl-android 0.18.1"
            textSize = 13f
            setTextColor(Color.DKGRAY)
            setPadding(0, dp(4), 0, dp(12))
        })

        urlInput = EditText(this).apply {
            setText("https://www.youtube.com/watch?v=aqz-KE-bpKQ")
            hint = "Video URL"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine(true)
        }
        root.addView(urlInput, matchWidth())

        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(10), 0, dp(10))
        }

        fun addButton(label: String, action: () -> Unit) {
            val button = Button(this).apply {
                text = label
                isAllCaps = false
                setOnClickListener { action() }
            }
            buttons.add(button)
            row.addView(button, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginEnd = dp(6)
            })
        }

        addButton("Probe") { runTask("Probe") { probe() } }
        addButton("MP4") { runTask("MP4") { download("mp4") } }
        addButton("MP3") { runTask("MP3") { download("mp3") } }
        addButton("Both") { runTask("Both") { download("mp4"); download("mp3") } }
        root.addView(row, matchWidth())

        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progress = 0
        }
        root.addView(progressBar, matchWidth())

        statusView = TextView(this).apply {
            text = "Starting…"
            textSize = 13f
            setPadding(0, dp(6), 0, dp(8))
        }
        root.addView(statusView, matchWidth())

        logView = TextView(this).apply {
            textSize = 11f
            typeface = Typeface.MONOSPACE
            setTextColor(Color.DKGRAY)
            setBackgroundColor(Color.rgb(245, 245, 245))
            setPadding(dp(8), dp(8), dp(8), dp(8))
            movementMethod = ScrollingMovementMethod()
        }
        root.addView(logView, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

        return root
    }

    private fun runTask(label: String, block: () -> Unit) {
        if (!busy.compareAndSet(false, true)) return
        lastProgress = -2f
        lastProgressAt = 0L
        progressBar.progress = 0
        statusView.text = label
        setButtonsEnabled(false)

        executor.execute {
            try {
                block()
                ui { statusView.text = "$label done" }
            } catch (error: Exception) {
                ui {
                    log("$label failed: ${error.message}")
                    statusView.text = "$label failed"
                }
            } finally {
                ui {
                    busy.set(false)
                    setButtonsEnabled(true)
                }
            }
        }
    }

    private fun probe() {
        val target = url()
        log("probing $target")
        val info = YoutubeDL.getInstance().getInfo(target)
        val formats = info.formats ?: arrayListOf()
        val heights = formats
            .map { it.height }
            .filter { it > 0 }
            .distinct()
            .sortedDescending()
        ui {
            log("title=${info.title ?: info.fulltitle}")
            log("duration=${info.duration}s · formats=${formats.size} · heights=${heights.take(10).joinToString(",")}")
        }
    }

    private fun download(kind: String) {
        val target = url()
        val dir = File(getExternalFilesDir(null), "clipshed-spike").apply { mkdirs() }
        val base = "clip-$kind-${System.currentTimeMillis()}"
        val request = YoutubeDLRequest(target)
            .addOption("--no-playlist")
            .addOption("--no-mtime")
            .addOption("--download-sections", "*00:00:05-00:00:15")
            .addOption("-o", File(dir, "$base.%(ext)s").absolutePath)

        if (kind == "mp3") {
            request.addOption("-f", "ba/b")
            request.addOption("-x")
            request.addOption("--audio-format", "mp3")
            request.addOption("--audio-quality", "192K")
        } else {
            request.addOption("-f", "bv*[height<=720]+ba/b[height<=720]")
            request.addOption("--merge-output-format", "mp4")
            request.addOption("--force-keyframes-at-cuts")
        }

        log("downloading $kind · section 00:00:05-00:00:15")
        val response = YoutubeDL.getInstance().execute(request, "spike-$kind") { progress, eta, line ->
            val now = System.currentTimeMillis()
            if (progress != lastProgress || now - lastProgressAt > 1000) {
                lastProgress = progress
                lastProgressAt = now
                ui {
                    if (progress >= 0) progressBar.progress = progress.toInt().coerceIn(0, 100)
                    statusView.text = if (progress >= 0) {
                        "$kind ${progress.toInt()}%" + if (eta > 0) " · ETA ${eta}s" else ""
                    } else {
                        kind
                    }
                }
            }
            if (line.isNotBlank() && line.contains("ERROR")) log(line.trim())
        }

        log("$kind exit=${response.exitCode} · ${response.elapsedTime}ms")
        if (response.exitCode != 0) {
            val tail = response.err.lines().filter { it.isNotBlank() }.takeLast(4).joinToString(" | ")
            if (tail.isNotBlank()) log("stderr: $tail")
        }

        val ext = if (kind == "mp3") "mp3" else "mp4"
        val output = dir
            .listFiles { file -> file.isFile && file.name.startsWith(base) && file.extension == ext }
            ?.maxByOrNull { it.length() }

        if (output == null) {
            log("no .$ext output found in ${dir.absolutePath}")
            return
        }

        val uri = publishToDownloads(output, if (kind == "mp3") "audio/mpeg" else "video/mp4")
        log("saved ${output.name} (${output.length() / 1024} KB) · $uri")
        output.delete()
    }

    /** Copies a finished file into the public Downloads/ClipshedSpike folder. */
    private fun publishToDownloads(file: File, mime: String): Uri {
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, file.name)
            put(MediaStore.MediaColumns.MIME_TYPE, mime)
            put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/ClipshedSpike")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }

        val collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI
        val uri = contentResolver.insert(collection, values)
            ?: throw IOException("could not create a Downloads entry")

        try {
            contentResolver.openOutputStream(uri)?.use { output ->
                file.inputStream().use { input -> input.copyTo(output) }
            } ?: throw IOException("could not open the Downloads output stream")

            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            contentResolver.update(uri, values, null, null)
            return uri
        } catch (error: Exception) {
            contentResolver.delete(uri, null, null)
            throw error
        }
    }

    private fun url(): String {
        val value = urlInput.text.toString().trim()
        require(value.startsWith("http://") || value.startsWith("https://")) { "Enter an http(s) URL" }
        return value
    }

    private fun setBusy(value: Boolean) {
        busy.set(value)
        setButtonsEnabled(!value)
    }

    private fun setButtonsEnabled(enabled: Boolean) {
        for (button in buttons) button.isEnabled = enabled
        urlInput.isEnabled = enabled
    }

    private fun log(message: String) {
        ui {
            logLines.addLast("${timeFormat.format(Date())}  $message")
            while (logLines.size > 250) logLines.removeFirst()
            logView.text = logLines.joinToString("\n")
        }
    }

    private fun ui(block: () -> Unit) {
        runOnUiThread(block)
    }

    private fun matchWidth(): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
