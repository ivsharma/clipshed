# Clipshed Android spike

Phase 0 feasibility app for the Tauri + Android plan. It proves the download
engine before we invest in the mobile shell.

## What it does

- Initializes `youtubedl-android` 0.18.1 (Python, yt-dlp, ffmpeg, QuickJS)
- Probes a YouTube URL and prints title, duration, format count, and available heights
- Downloads a 10-second section (`00:00:05-00:00:15`) as MP4
- Downloads the same kind of section as MP3
- Saves finished files to `Downloads/ClipshedSpike` through MediaStore
- Prints yt-dlp progress and errors on screen

It is deliberately a throwaway app: one activity, one executor, no persistence,
no foreground service, and no local HTTP API yet.

## Build

Prerequisites:

- JDK 21 (`JAVA_HOME`)
- Android SDK with `platforms;android-35` and `build-tools;35.0.0`
- `ANDROID_HOME` / `ANDROID_SDK_ROOT`

```powershell
cd spike/android
.\gradlew.bat :app:assembleRelease
```

The release variant is signed with the local Android debug key so it can be
sideloaded. Do not distribute it.

Outputs:

```text
app/build/outputs/apk/release/app-arm64-v8a-release.apk
app/build/outputs/apk/release/app-x86_64-release.apk
```

## Measured APK size

| ABI | Size |
|---|---:|
| `arm64-v8a` | 57.2 MB |
| `x86_64` | 60.1 MB |

Native payload (arm64): `libpython.so`, `libffmpeg.so`, `libffprobe.so`,
`libqjs.so`, plus their zipped runtime packages.

## Install

With a USB-connected device:

```powershell
adb install -r app/build/outputs/apk/release/app-arm64-v8a-release.apk
adb shell am start -n com.clipshed.spike/.MainActivity
```

Or copy the arm64 APK to the phone and open it. Allow installs from unknown
sources when prompted.

## What to check

1. Tap **Probe**. The log should show the title, duration, format count, and
   several heights. A 4K URL should list heights up to 2160 — that is the
   QuickJS/n-sig check.
2. Tap **MP4**. Progress should move, and `Downloads/ClipshedSpike` should get a
   roughly 10-second MP4.
3. Tap **MP3**. The same folder should get a roughly 10-second MP3.
4. Check `adb logcat` for warnings such as `No supported JavaScript runtime`.
   None should appear, because 0.18.1 passes `--js-runtimes quickjs:<libqjs.so>`.
