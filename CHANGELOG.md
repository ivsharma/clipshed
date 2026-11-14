# Changelog

All notable changes to Clipshed are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
