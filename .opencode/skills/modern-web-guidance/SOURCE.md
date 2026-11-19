# Modern Web Guidance

This project vendors the `modern-web-guidance` agent skill from
[GoogleChrome/modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance)
at commit `64a6d708f5a43f2cd3fde5d4d7db3905ba1bdf65` (v1.0.1, 2026-11-16).

- Skill content: Apache-2.0
- Guide content: CC-BY-4.0
- Upstream documentation: <https://developer.chrome.com/docs/modern-web-guidance>

The skill is a thin set of instructions; the actual guides are retrieved on
demand with `npx -y modern-web-guidance@latest search/retrieve`. Update the
vendored `SKILL.md` when the upstream skill version changes. The CLI can also
update an installed copy with `npx modern-web-guidance@latest update`.

## Usage

For HTML, CSS, and client-side JavaScript work:

```powershell
$env:DISABLE_TELEMETRY = "1"
npx -y modern-web-guidance@latest search "<2-5 word query>"
npx -y modern-web-guidance@latest retrieve "<guide-id>"
```

The project browser-support policy lives in `AGENTS.md`. Do not enable Origin
Trial or volatile-feature guides without an explicit product decision.
