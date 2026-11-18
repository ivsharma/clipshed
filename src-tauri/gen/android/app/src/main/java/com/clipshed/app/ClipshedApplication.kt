package com.clipshed.app

import android.app.Application
import com.clipshed.app.server.ServerHost

class ClipshedApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        ServerHost.start(this)
    }
}
