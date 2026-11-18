package com.clipshed.app.server

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder

class DownloadService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Downloads",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Clipshed download progress"
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val title = intent.getStringExtra(EXTRA_TITLE) ?: "Downloading"
                startForeground(
                    NOTIFICATION_ID,
                    buildNotification(title, intent.getIntExtra(EXTRA_PERCENT, -1)),
                )
            }
            ACTION_UPDATE -> {
                val title = intent.getStringExtra(EXTRA_TITLE) ?: "Downloading"
                getSystemService(NotificationManager::class.java).notify(
                    NOTIFICATION_ID,
                    buildNotification(title, intent.getIntExtra(EXTRA_PERCENT, -1)),
                )
            }
            ACTION_STOP -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    private fun buildNotification(title: String, percent: Int): Notification {
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        val pending = launch?.let {
            PendingIntent.getActivity(
                this,
                0,
                it,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
        }

        val builder = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Clipshed")
            .setContentText(title)
            .setOngoing(true)
            .setOnlyAlertOnce(true)

        if (pending != null) builder.setContentIntent(pending)
        if (percent >= 0) {
            builder.setProgress(100, percent.coerceIn(0, 100), false)
        } else {
            builder.setProgress(0, 0, true)
        }
        return builder.build()
    }

    companion object {
        const val CHANNEL_ID = "clipshed-downloads"
        const val NOTIFICATION_ID = 43123
        const val ACTION_START = "com.clipshed.app.action.START_DOWNLOAD"
        const val ACTION_UPDATE = "com.clipshed.app.action.UPDATE_DOWNLOAD"
        const val ACTION_STOP = "com.clipshed.app.action.STOP_DOWNLOAD"
        const val EXTRA_TITLE = "title"
        const val EXTRA_PERCENT = "percent"

        fun start(context: Context, title: String) {
            val intent = Intent(context, DownloadService::class.java)
                .setAction(ACTION_START)
                .putExtra(EXTRA_TITLE, title)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun update(context: Context, title: String, percent: Int) {
            val intent = Intent(context, DownloadService::class.java)
                .setAction(ACTION_UPDATE)
                .putExtra(EXTRA_TITLE, title)
                .putExtra(EXTRA_PERCENT, percent)
            context.startService(intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, DownloadService::class.java))
        }
    }
}
