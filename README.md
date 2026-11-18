# Clipshed

**Download only the part you need.** Clipshed is a local-first video range clipper. Paste a YouTube, Facebook, or Instagram link, pick MP4, MP3, or both, and fetch just the section you want.

[![CI](https://github.com/ivsharma/clipshed/actions/workflows/ci.yml/badge.svg)](https://github.com/ivsharma/clipshed/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%E2%89%A522-339933)
![License: MIT](https://img.shields.io/badge/license-MIT-yellow)
![Local-first](https://img.shields.io/badge/local--first-yes-34d399)

![Clipshed range selection](docs/range-selection.png)

## Why Clipshed?

Most downloaders fetch the entire video, then make you trim it afterward. Clipshed treats the time range as the primary input: **15:00–20:00** means it downloads only that section.

- **Range-first timeline** — drag handles or type exact times; chapter markers included.
- **MP4, MP3, or both** — “Both” downloads the section once and extracts the MP3 from it.
- **Fast or exact cut** — keyframe-aligned stream copy, or frame-accurate re-encode.
- **Local and private** — yt-dlp and ffmpeg run on your machine. No account, no cloud, no uploads.
- **Real job handling** — queue, live progress, cancellation, history, and cleanup.
- **Windows desktop app** — an Electron build with yt-dlp, ffmpeg, and QuickJS bundled. No Node install or dev server on the target machine.

## Supported platforms

| Platform | Status | What works |
|---|---|---|
| **YouTube** | Stable | Watch links, `youtu.be`, Shorts, embeds, livestream replays |
| **Facebook** | Experimental | `watch` links, reels, page videos, `fb.watch`; some posts need a signed-in session (cookies coming soon) |
| **Instagram** | Experimental | Posts, reels; some content needs a signed-in session (cookies coming soon) |

Facebook and Instagram support depends on yt-dlp's extractors. See [Limitations](docs/README_TECHNICAL.md#limitations) before relying on them.

## Quick start

Requirements: Windows 10/11 and Node.js **22+**.

```powershell
npm install
npm run setup
npm run dev
```

Open **http://127.0.0.1:5173**.

`npm run setup` downloads the standalone `yt-dlp.exe`, a static `ffmpeg` build, and QuickJS into `bin/`. No Python install is required.

Production-style run:

```powershell
npm run build
npm start
```

Open **http://127.0.0.1:3000**. Or use `start.ps1`.

## Windows desktop app

Build a self-contained desktop app. The target PC does not need Node installed.

```powershell
npm install
npm run setup
npm run desktop:run    # run the desktop shell from source
npm run desktop:pack   # unpacked build in release/win-unpacked
npm run desktop:dist   # installer + portable exe in release/
```

`desktop:dist` creates:

- `Clipshed-Setup-<version>.exe` — per-user installer with Start Menu and desktop shortcuts
- `Clipshed-<version>-portable.exe` — no-install portable build

The desktop app stores settings, history, downloads, and a managed yt-dlp copy in
`%LOCALAPPDATA%\Clipshed` (development builds use `Clipshed Dev`). ffmpeg and
QuickJS run from the bundled resources. It starts the local API on a random
loopback port and opens the real UI in an Electron window.

Builds are currently unsigned, so Windows SmartScreen may warn on first launch.
The installer is large because it includes Electron, ffmpeg, yt-dlp, and
QuickJS. See the [desktop size breakdown](docs/README_TECHNICAL.md#package-size).

### Tauri Windows build

The Tauri build uses the shared WebView2 runtime and a bundled Node sidecar. It
runs the same React UI and API and shares `%LOCALAPPDATA%\Clipshed` data with the
Electron app.

```powershell
npm run tauri:windows:build
```

Output:

```text
src-tauri\target\release\bundle\nsis\Clipshed_1.1.0_x64-setup.exe
```

Measured: **97.6 MB installer**, **295.5 MB installed**. Electron remains
available through `desktop:dist` while Tauri download/notification polish is
finished.

## Android app

The Android app uses the same React UI and downloads on-device through a Kotlin
Tauri shell plus `youtubedl-android` (Python, ffmpeg, and QuickJS). Finished
files are saved to `Downloads/Clipshed`.

```powershell
npm run tauri:android:init   # one time
powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1 -Target aarch64 -Release
```

Output:

```text
src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk
```

The APK is currently signed with the Android debug key. See the
[Tauri migration plan](docs/TAURI_MIGRATION.md) for build details, the Windows
symlink workaround, measured sizes, and current limitations.

## Configuration

Open the gear icon to choose Light, Dark, or Dark contrast, set H.264 preference, check for app updates, and update yt-dlp. Optional `.env` values include `PORT`, `HOST`, `MAX_CONCURRENT_JOBS`, and `JOB_TTL_HOURS`.

Cookie-based sign-in is coming soon. Public videos work without cookies.

## Documentation

The full reference is in [the technical README](docs/README_TECHNICAL.md):

- [Architecture](docs/README_TECHNICAL.md#architecture)
- [Desktop app (Electron)](docs/README_TECHNICAL.md#desktop-app-electron) — runtime model, data paths, packaging, updates, and package size
- [Versioning and releases](docs/README_TECHNICAL.md#versioning-and-releases) — SemVer policy, release script, and tagging

## Limitations

- Single videos only; playlists and channels are rejected.
- Active live streams aren't supported; replays are.
- Facebook and Instagram are experimental and may need a signed-in session (cookie sign-in is coming soon).
- No subtitles, SponsorBlock, or compression presets yet.
- Windows-first setup; the server is local-only and binds to `127.0.0.1`.

## Disclaimer

Clipshed is a local, personal-use tool. Download only content you have the right to use, and follow each site's terms of service and copyright law. Not affiliated with YouTube, Meta, or any other platform.

## License

MIT — see [LICENSE](LICENSE).
