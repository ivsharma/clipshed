# Changelog

All notable changes to Clipshed are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Android app built with Tauri v2: the shared React UI runs against a local Ktor
  server and youtubedl-android, with on-device MP4, MP3, and Both downloads,
  MediaStore saves, a foreground download service, job
  history, update checks, and in-app yt-dlp updates.
- Tauri v2 Windows app with the same React UI/API and a bundled Node sidecar:
  **97.8 MiB** NSIS installer and **295.5 MB** installed, using the shared
  WebView2 runtime instead of bundling Chromium.
- Windows downloads now get unique names in the Downloads folder and show a
  completion notification. A second launch focuses the running window, and
  external links open in the default browser instead of inside the app.
- Recent activity now lists all 100 saved jobs and has a **Clear all** action
  that removes finished jobs and their app-private files. Files already saved to
  Downloads are not affected.

### Changed

- Removed the bundled `ffprobe` binary, trimming about 162 MB from packaged
  installs and about 45 MB from the installer. The finished file's duration is
  now read from ffmpeg's input banner, and its size comes from the file system.
- Tauri is now the only Windows desktop shell. The Electron fallback and its
  build tooling were removed after the Tauri app passed interactive testing.
- Cookie-based sign-in is temporarily disabled and shown as “Coming soon” in
  Settings. Existing cookie settings are ignored until it returns.

### Removed

- Electron and electron-builder dependencies, `desktop/main.cjs`,
  `electron-builder.yml`, and the `desktop:run`/`desktop:pack`/`desktop:dist`
  scripts. The shared Node sidecar, server bundle, icon source, and third-party
  notices remain because Tauri still uses them.

### Fixed

- Android: the Paste button now reads the clipboard through the local Kotlin
  server, since Android WebViews block the async clipboard API.
- Android: content no longer draws under the status and navigation bars.
  Scrolled content is masked at the safe-area edges, and status-bar icon
  contrast follows the selected theme.
- Android: external links, including the release link in Settings, now open in
  the default browser instead of being ignored by the WebView.

## [1.1.0] - 2026-11-16

### Added

- Light, Dark, and Dark contrast themes, selectable in Settings and remembered
  per device.
- In-app update checks against GitHub Releases, with release links and
  pre-release labels.

## [1.0.1] - 2026-11-14

### Fixed

- Capped time-input parsing to reject oversized values before running the unit
  parser.
- Validated job IDs and constrained cleanup paths before filesystem operations.

## [1.0.0] - 2026-11-14

### Added

- Initial public release of Clipshed, with range-first MP4, MP3, and MP4 + MP3
  downloads.
- Windows desktop app built with Electron. It runs the existing local server and
  UI without requiring Node, a terminal, or a development server.
- Bundled yt-dlp, ffmpeg, ffprobe, and QuickJS binaries for self-contained
  installs.
- Per-user NSIS installer and a no-install portable EXE.
- In-app yt-dlp updates in packaged builds through the managed copy in
  `%LOCALAPPDATA%\Clipshed\bin`.
- Windows download handling with unique filenames and completion notifications.
- Shared server entrypoint used by both the CLI and the Electron shell.
- Desktop architecture, packaging, security, and release documentation.

### Changed

- `npm run setup` now downloads QuickJS alongside yt-dlp and ffmpeg.
- Desktop builds use the bundled QuickJS runtime for yt-dlp when available, and
  fall back to Node during development.
- Only yt-dlp is staged into the writable app home; ffmpeg, ffprobe, and QuickJS
  run from the bundled resources. Obsolete staged copies are cleaned up on
  launch.
- Desktop artifacts are named from the package version, starting with
  `1.0.0`.

### Fixed

- Prevented the export layout from overflowing on narrow screens.
- Prevented the recent-activity list from toggling a horizontal scrollbar during
  an active download, which made the lower page flicker and jump.
