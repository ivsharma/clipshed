package com.clipshed.app.server

import android.content.ContentValues
import android.content.Context
import android.os.Environment
import android.provider.MediaStore
import java.io.File

object MediaStoreSaver {
    fun save(context: Context, file: File, mime: String): SaveResult {
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, file.name)
            put(MediaStore.MediaColumns.MIME_TYPE, mime)
            put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/Clipshed")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI
        val uri = resolver.insert(collection, values)
            ?: throw ApiException("SAVE_FAILED", "Could not create a Downloads entry.", 500)

        try {
            resolver.openOutputStream(uri)?.use { output ->
                file.inputStream().use { input -> input.copyTo(output) }
            } ?: throw ApiException("SAVE_FAILED", "Could not open the Downloads output stream.", 500)

            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            return SaveResult(saved = true, filename = file.name, uri = uri.toString())
        } catch (error: Throwable) {
            resolver.delete(uri, null, null)
            throw error
        }
    }
}
