# Tauri v2 migration plan (Windows + Android)

Status: planning / Phase 0 spike in progress.

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

### Phase 1: Android Tauri shell

Wrap the proven engine in Tauri Android:

- Kotlin `Ktor` server implementing the same HTTP/SSE API;
- foreground service so downloads survive backgrounding;
- MediaStore output to `Downloads/Clipshed`;
- cookie import through the system file picker (no browser-cookie reading);
- Tauri window loads `http://127.0.0.1:<port>`;
- clear it with a cleartext-traffic exception for loopback.

The Tauri shell should start the server before loading the URL and should fail
with a readable error if the server cannot start.

### Phase 2: Windows Tauri shell

- Tauri spawns the current Node server bundle as a sidecar.
- Tauri loads the assigned loopback URL.
- Reimplement download naming, save-to-Downloads, and completion notifications
  in the shell.
- Keep the current server and tests until parity is proven.
- Retire Electron only after the Tauri app passes the same manual checks.

Expected install size: about 293 MB (Tauri + Node + ffmpeg/yt-dlp/QuickJS),
versus 498 MB for the current Electron build.

### Phase 3: optional Windows Rust backend

Port the Node server to Rust behind the same HTTP API. This removes the ~95 MB
Node sidecar and brings the Windows install to roughly 200 MB. It does not help
Android, because Android still needs Kotlin plus `youtubedl-android`.

## Size budget

| Target | Installed |
|---|---:|
| Current Windows (Electron, en-US locale) | 497.8 MB |
| Windows Tauri + Node sidecar | ~293 MB |
| Windows Tauri + Rust backend | ~200 MB |
| Android arm64 APK | ~57 MB (measured Phase 0) |

The shared WebView2 runtime is not included in the Windows number. It ships with
Windows 11 and current Windows 10/Edge installs; a fixed-runtime bundle would add
roughly 180 MB.

## Toolchain

Installed for this work:

- Rust 1.100 (MSVC) with the four Android targets;
- Visual Studio 2022 Build Tools (C++ workload);
- JDK 21 (Temurin);
- Android SDK command-line tools, platform 35, build-tools 35.0.0, emulator;
- Gradle 8.13 and a project wrapper.

Still needed for Tauri Android:

- Android NDK (`ndk;27.x` or the version required by the Tauri template);
- `@tauri-apps/cli` in the project;
- a Tauri `src-tauri` scaffold;
- `cargo-ndk` if the Tauri template requires it.

## Risks

- `youtubedl-android` is GPLv3. Personal sideloading is fine; public distribution
  requires source/notices.
- YouTube extraction depends on the bundled yt-dlp and QuickJS versions. Test
  early and keep the library current.
- Android background execution, MediaStore, cookie import, and notifications are
  real feature work, not shell polish.
- Two server implementations can drift. Keep API contract tests and compare
  responses between the Node and Kotlin servers.
- Tauri Android loading a loopback URL needs a cleartext exception; verify before
  building the full API.
- Windows Tauri + Node still ships Node. Only the Phase 3 Rust port removes it.
