# Clipshed agent guidance

## Web platform policy

- **Render targets:** WebView2 on Windows (Chromium, evergreen), Android System
  WebView on Android 10+ (usually updated through the Play Store), and
  Chrome/Edge for local development. Safari and Firefox are not targets.
- **Baseline:** Use Baseline Widely available features without fallbacks.
  Newly Available features are allowed when they are feature-detected and have
  a graceful degradation path. Do not add heavy polyfills or large helper
  dependencies for browsers Clipshed does not ship.
- **Mobile:** Respect safe-area insets and dynamic viewport units. The Android
  shell injects `--safe-area-inset-*` values; see `web/src/index.css` and
  `MainActivity.kt`.
- **Accessibility:** Prefer native HTML elements (`button`, `dialog`, `input`,
  `progress`) and their built-in keyboard/screen-reader behavior over custom
  widgets. Preserve the existing focus, reduced-motion, and forced-colors
  behavior.

## Modern Web Guidance

Before implementing or auditing HTML, CSS, or client-side JavaScript UI work,
load the `modern-web-guidance` skill and search/retrieve the relevant guide(s).
Use `npx -y modern-web-guidance@latest`; set `DISABLE_TELEMETRY=1` in local
shells if desired. Adapt the guide to React rather than replacing the framework.

For broad, open-ended modernization requests, `legacy-scan web/src` may be used
to find candidate legacy patterns. Verify every finding against its guide and
drop false positives before editing.

## Project-specific notes

- The UI is a single React/Vite app used by Windows WebView2, Android WebView,
  and the browser development server.
- Windows and Android are separate backends but share the same HTTP/SSE API.
  Changes to UI behaviour that depend on the shell must go through the narrow
  Android `ClipshedShell` bridge or the Windows Tauri handlers.
- Do not add Electron fallbacks or Electron dependencies; the fallback was
  retired.
- Keep UI dependencies minimal. The app is local-first and bundles its runtime.
