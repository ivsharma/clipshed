# Tauri v2 migration plan (Windows + Android)

Status: Phase 1 complete for Android. Phase 2 core complete for Windows. Phase 3 optional.

## Goal

One React UI and one API contract, shipped as:

- a Windows desktop app without Electron;
- a sideloadable Android APK that downloads on-device.

Tauri v2 supplies the shell, WebView, installers, and mobile build tooling. It
does not unify the download engine: the current Node server cannot run on
Android because mobile Node runtimes do not support `child_process`, which the
server needs to spawn yt-dlp and ffmpeg. Android uses `youtubedl-android`
instead.

## Target architecture

```text
Windows:  Tauri (WebView2)  ->  http://127.0.0.1:<port>  ->  Node sidecar  ->  yt-dlp.exe / ffmpeg.exe
Android:  Tauri (WebView)   ->  http://127.0.0.1:<port>  ->  Kotlin Ktor   ->  youtubedl-android (Python/ffmpeg/QuickJS)
```

The local server serves the built UI and the API, so the React app keeps using
relative `/api` paths and SSE. The API contract, shared types, error codes, and
filename/range rules are the cross-platform source of truth.

## Phases

### Phase 0: Android engine spike

Standalone Kotlin app in `spike/android` using `youtubedl-android` 0.18.1.

Acceptance:

- probe a YouTube URL and report duration and formats;
- download a 10-second MP4 range;
- download a 10-second MP3 range;
- save both to `Downloads/ClipshedSpike`;
- no `No supported JavaScript runtime` warning (0.18.1 passes QuickJS);
- measure APK size and verify sideloading on a real arm64 phone.

Measured so far:

| ABI | APK |
|---|---:|
| `arm64-v8a` | 57.2 MB |
| `x86_64` | 60.1 MB |

Phase 0 result: **passed** on an Android 15 x86_64 emulator.

- probe returned 39 formats with heights up to 2160p;
- QuickJS reported `Solving JS challenges using quickjs` with no nsig errors;
- MP4 output was 10.00 s, 1280×720 H.264 + AAC;
- MP3 output was 10.02 s, 192 kbps stereo;
- both files landed in `Downloads/ClipshedSpike` through MediaStore.

One critical finding: the yt-dlp bundled with `youtubedl-android` 0.18.1 is
2025.11.12, which YouTube rejects with 403/SABR. After updating to 2026.10.26,
downloads worked. The Android app must update yt-dlp on first launch and expose
the update action in Settings.

### Phase 1: Android Tauri shell — complete

Implemented in `src-tauri`. The Android server lives under
`src-tauri/gen/android/app/src/main/java/com/clipshed/app/server`.

- The Tauri window loads `http://127.0.0.1:43123`, served by an embedded Ktor CIO
  server. The server also serves the built React UI, so the frontend still uses
  relative `/api` paths and SSE.
- The Ktor server implements the existing API: health, probe, settings, cookies
  import (backend only; the UI is disabled), jobs, SSE events, cancel, delete,
  file serving, MediaStore save, updates check, and yt-dlp update.
- `youtubedl-android` 0.18.1 provides Python, yt-dlp, ffmpeg, and QuickJS. yt-dlp
  updates automatically on first launch and from Settings.
- A foreground `DownloadService` keeps downloads alive when the app is
  backgrounded and shows progress in a notification.
- Finished files are published to `Downloads/Clipshed` through MediaStore.
  The shared UI detects Android and calls `POST /api/jobs/{id}/save` instead of
  navigating to a file URL.
- Cookie import remains in the backend, but the Settings UI is disabled and
  marked “Coming soon”. Existing cookie settings are ignored.
- The Paste button reads the device clipboard through `/api/clipboard` on
  Android, because Android WebViews deny the async clipboard API.
- Job history persists in `jobs.json`; active jobs interrupted by a restart are
  marked failed.
- Launcher icons are generated from `desktop/resources/icon.svg` with
  `tauri icon`.

Verified on an Android 15 x86_64 emulator:

- the real React UI loads in the Tauri WebView;
- health reports yt-dlp 2026.10.26 and bundled ffmpeg;
- probe of Big Buck Bunny returns 635 s, 39 formats, up to 2160p;
- MP4 is 10.03 s, 1280×720 H.264 + AAC;
- MP3 is 10.02 s, 192 kbps stereo;
- Both produces MP4 + MP3 from one MP4 download;
- saving writes to `Downloads/Clipshed` (duplicate names become `(1)`);
- a download completes while the app is backgrounded, then the service stops;
- cancel leaves no service or temp files;
- settings, history persistence, and update checks work;
- the Paste button reads the clipboard and fills the URL field.

Known Phase 1 limitations:

- Progress is coarse for `--download-sections` jobs (indeterminate, then 99–100%)
  because yt-dlp delegates the range fetch to ffmpeg. Other downloads use
  yt-dlp's own progress.
- Cookie-based sign-in is disabled for now and shown as “Coming soon”; public
  videos work without it.
- The release APK is signed with the Android debug key. Replace the release
  `signingConfig` with a real keystore before sharing it.
- Tauri warns that `com.clipshed.app` ends in `.app`; this only matters for
  macOS, which is not a target.

#### Building the Android APK on Windows

Tauri creates a symlink for the Rust `.so` in `jniLibs`. A non-elevated Windows
shell cannot do that unless Developer Mode is enabled. `scripts/build-android.ps1`
works around this by building the Rust library, copying it into `jniLibs`, and
running Gradle with the Rust tasks skipped:

```powershell
# arm64 release for a phone
powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1 -Target aarch64 -Release

# x86_64 release for the emulator
powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1 -Target x86_64 -Release
```

Requires `JAVA_HOME`, `ANDROID_HOME`, and `NDK_HOME`. The arm64 release build
also sets 16 KB page-size linker flags.

Output:

```text
src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk
src-tauri/gen/android/app/build/outputs/apk/x86_64/release/app-x86_64-release.apk
```

With Developer Mode enabled, the normal `npx tauri android build --apk --target
aarch64` path works without the wrapper script.

### Phase 2: Windows Tauri shell — complete

Implemented:

- The Rust setup starts a bundled Node sidecar (`node.exe` +
  `server/sidecar.cjs`) with `CLIPSHED_ROOT`, `DATA_DIR`, `BIN_DIR`,
  `FFMPEG_DIR`, `QJS_PATH`, and `WEB_DIST`.
- The Tauri window is created after the server listens on `127.0.0.1:43123`
  and loads the same React UI.
- Bundled resources: `node.exe`, `server.cjs`, `sidecar.cjs`, the web build,
  and `ffmpeg.exe`, `yt-dlp.exe`, and `qjs.exe`.
- The managed yt-dlp copy lives in `%LOCALAPPDATA%\Clipshed\bin`; stale
  ffmpeg/ffprobe/qjs copies are removed at startup.
- The window is 1180×760 with `preventOverflow`, min 900×640.
- `npm run tauri:windows:build` builds the web UI, server bundle, stages
  `node.exe`, and produces an NSIS installer.
- `scripts/stage-tauri-windows.mjs` handles the sidecar naming.
- `tauri.windows.conf.json` keeps Windows-only resources and `externalBin`
  out of the Android build.
- WebView2 downloads are handled by the shell: the file is saved to the user's
  Downloads folder with a unique `(1)`, `(2)`, … name when needed, and a
  completion notification names the saved file.
- A single-instance lock makes a second launch restore and focus the existing
  window instead of starting another server.
- The navigation guard keeps the webview on `127.0.0.1:43123`; `http` and
  `https` links, including `window.open` popups, open in the default browser.
- Automatic downloads and clipboard reads are allowed by the WebView2
  permission handler.

Measured:

| Part | Installed |
|---|---:|
| Tauri shell (`app.exe`) | 11.4 MB |
| `node.exe` sidecar | 95.5 MB |
| `ffmpeg.exe` | 162.2 MB |
| `yt-dlp.exe` | 22.5 MB |
| QuickJS | 2.1 MB |
| Server bundle, web UI, notices | ~2.4 MB |
| **Total** | **295.5 MB** |
| NSIS installer | **97.6 MB** |

Verified:

- dev and installed builds launch, the window loads the real UI, and health is
  green;
- a 10-second MP4 job completes through the Tauri-hosted Node server;
- the file endpoint serves the finished MP4;
- the installed app and Node sidecar shut down together;
- repeated downloads of the same title save as ` (1)`, ` (2)`, …;
- a completion notification appears after a download finishes;
- a second launch exits and restores/focuses the running window;
- `https://example.com` opens in the default browser while the app stays on its
  local page.

Remaining before retiring Electron:

- The NSIS installer is unsigned.

### Phase 3: optional Windows Rust backend

Port the Node server to Rust behind the same HTTP API. This removes the ~95 MB
Node sidecar and brings the Windows install to roughly 200 MB. It does not help
Android, because Android still needs Kotlin plus `youtubedl-android`.

## Size budget

| Target | Size |
|---|---:|
| Windows Electron installed (en-US locale) | 497.8 MB |
| Windows Electron installer | 178.6 MB |
| **Windows Tauri installed** | **295.5 MB** |
| **Windows Tauri NSIS installer** | **97.6 MB** |
| Windows Tauri + Rust backend (Phase 3) | ~200 MB |
| Android arm64 release APK | 71.0 MB |
| Android x86_64 release APK | 74.0 MB |
| Android arm64 debug APK | 107.8 MB |

The shared WebView2 runtime is not included in the Windows number. It ships with
Windows 11 and current Windows 10/Edge installs; a fixed-runtime bundle would add
roughly 180 MB. The Android APK includes its Python/ffmpeg/QuickJS payload but
uses the system Android WebView.

## Toolchain

Installed for this work:

- Rust 1.100 (MSVC) with the four Android targets;
- Visual Studio 2022 Build Tools (C++ workload);
- JDK 21 (Temurin);
- Android SDK command-line tools, platform 36, build-tools 36.0.0, emulator;
- Android NDK 27.3.13750724;
- Tauri CLI 2.12.5 via `@tauri-apps/cli`;
- Gradle 9.6.1 through the Android project wrapper.

The Windows Tauri shell (Phase 2) needs no additional toolchain.

## Risks

- `youtubedl-android` is GPLv3. Personal sideloading is fine; public distribution
  requires source/notices.
- YouTube extraction depends on the bundled yt-dlp and QuickJS versions. The
  library's bundled yt-dlp was already stale in the Phase 0 spike and had to be
  updated before downloads worked. Update on first launch and keep the library
  current.
- Android background execution, MediaStore, cookie support (currently disabled),
  and notifications are real feature work, not shell polish.
- Two server implementations can drift. Keep API contract tests and compare
  responses between the Node and Kotlin servers.
- The Windows Tauri app still ships a 95.5 MB Node sidecar. Phase 3 moves it to
  Rust and removes that runtime.
- Electron remains the fallback until the Windows Tauri installer is code-signed
  and the packaged build gets a final smoke test on a clean machine.
- Range-download progress is coarse on Android because ffmpeg performs the cut;
  improving it needs a separate progress parser.
- The Android release APK and the Windows NSIS installer are currently signed
  with test/debug material. Use real signing keys before distribution.
