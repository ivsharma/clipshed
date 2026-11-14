import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, FileText, Globe2, Loader2, RefreshCw, Shield, X } from "lucide-react";
import type { CookiesBrowser, CookiesMode, Health, Settings } from "@clipshed/shared";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  settings: Settings | null;
  health: Health | null;
  saving: boolean;
  onSave: (settings: Settings) => Promise<void>;
  onUpdateYtDlp: () => Promise<{ ok: boolean; output: string }>;
}

const MODES: Array<{ id: CookiesMode; title: string; description: string; icon: LucideIcon }> = [
  { id: "none", title: "No cookies", description: "Works for most public videos.", icon: Shield },
  { id: "file", title: "Cookies file", description: "Point to an exported cookies.txt.", icon: FileText },
  { id: "browser", title: "From browser", description: "Read cookies from a local browser.", icon: Globe2 },
];

const BROWSERS: CookiesBrowser[] = ["chrome", "edge", "firefox", "brave", "chromium", "opera", "vivaldi"];

const BROWSER_LABELS: Record<CookiesBrowser, string> = {
  chrome: "Chrome",
  edge: "Edge",
  firefox: "Firefox",
  brave: "Brave",
  chromium: "Chromium",
  opera: "Opera (Stable)",
  vivaldi: "Vivaldi",
};

export function SettingsDialog({ open, onClose, settings, health, saving, onSave, onUpdateYtDlp }: SettingsDialogProps) {
  const [draft, setDraft] = useState<Settings | null>(settings);
  const [updating, setUpdating] = useState(false);
  const [updateOutput, setUpdateOutput] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (open && settings) setDraft(settings);
  }, [open, settings]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  if (!draft) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,19,16,0.62)] p-4">
        <div className="panel flex items-center gap-3 px-5 py-4 font-mono text-[12px] text-[var(--ink-soft)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading settings…
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    setSaveError(null);
    try {
      await onSave(draft);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save settings.");
    }
  };

  const handleUpdate = async () => {
    setUpdating(true);
    setUpdateOutput(null);
    try {
      const result = await onUpdateYtDlp();
      setUpdateOutput(result.output || (result.ok ? "yt-dlp is up to date." : "Update failed."));
    } catch (error) {
      setUpdateOutput(error instanceof Error ? error.message : "Update failed.");
    } finally {
      setUpdating(false);
    }
  };

  const ffmpegShort = health?.ffmpegVersion
    ? (health.ffmpegVersion.match(/ffmpeg version (\S+)/)?.[1] ?? health.ffmpegVersion.slice(0, 36))
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(20,19,16,0.62)] p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="panel animate-fade-in max-h-[92vh] w-full max-w-xl overflow-hidden shadow-[8px_8px_0_rgba(20,19,16,0.22)]"
      >
        <div className="flex items-start justify-between border-b border-[var(--line-strong)] px-5 py-4 sm:px-6">
          <div>
            <div className="mono-label text-[var(--red)]">Local settings</div>
            <h2 id="settings-title" className="display mt-1 text-3xl text-[var(--ink)]">
              Settings
            </h2>
          </div>
          <button type="button" onClick={onClose} className="btn-secondary h-8 w-8 p-0" aria-label="Close settings">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scrollbar-thin max-h-[calc(92vh-140px)] overflow-y-auto px-5 py-5 sm:px-6">
          <section>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <div className="mono-label">01 / Site access</div>
                <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-[var(--ink-mute)]">
                  Cookies help with age-restricted, private, or login-required posts. They never leave this machine.
                </p>
              </div>
              <span className="badge shrink-0">{health?.cookiesConfigured ? "Configured" : "Optional"}</span>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {MODES.map((mode) => {
                const Icon = mode.icon;
                const selected = draft.cookiesMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setDraft({ ...draft, cookiesMode: mode.id })}
                    className={cn(
                      "flex flex-col items-start gap-2 border p-3 text-left transition",
                      selected
                        ? "border-[var(--red)] bg-[rgba(217,58,31,0.06)]"
                        : "border-[var(--line-strong)] bg-[var(--paper-raised)] hover:border-[var(--ink)]",
                    )}
                  >
                    <Icon className={selected ? "h-4 w-4 text-[var(--red)]" : "h-4 w-4 text-[var(--ink-mute)]"} />
                    <span>
                      <span className="block text-[12px] font-semibold text-[var(--ink)]">{mode.title}</span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--ink-mute)]">{mode.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {draft.cookiesMode === "file" ? (
              <label className="mt-3 block">
                <span className="mono-label mb-1.5 block">cookies.txt path</span>
                <input
                  value={draft.cookiesFile}
                  onChange={(event) => setDraft({ ...draft, cookiesFile: event.target.value })}
                  className="field h-10 px-3 font-mono text-[12px]"
                  placeholder="C:\Users\you\cookies.txt"
                  spellCheck={false}
                />
              </label>
            ) : null}

            {draft.cookiesMode === "browser" ? (
              <div className="mt-3">
                <label className="block">
                  <span className="mono-label mb-1.5 block">Browser</span>
                  <select
                    value={draft.cookiesBrowser}
                    onChange={(event) => setDraft({ ...draft, cookiesBrowser: event.target.value as CookiesBrowser })}
                    className="field h-10 px-3 text-[12px]"
                  >
                    {BROWSERS.map((browser) => (
                      <option key={browser} value={browser}>
                        {BROWSER_LABELS[browser]}
                      </option>
                    ))}
                  </select>
                </label>

                {draft.cookiesBrowser === "opera" ? (
                  <div className="mt-2 border-l-2 border-l-[var(--amber)] bg-[var(--paper)] px-3 py-2 text-[11px] leading-relaxed text-[var(--ink-soft)]">
                    yt-dlp only reads <strong>Opera Stable</strong>. Opera GX stores cookies in a different folder,
                    so browser mode can&apos;t read it.{" "}
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, cookiesMode: "file" })}
                      className="underline decoration-[var(--red)] underline-offset-2 transition hover:text-[var(--red)]"
                    >
                      Use a cookies.txt file instead
                    </button>
                    .
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="mt-6 border border-[var(--line-strong)] p-3.5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="mono-label">02 / Compatibility</div>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-mute)]">
                  Prefer H.264 for older players. Most sites offer it up to 1080p; higher resolutions use VP9/AV1.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={draft.preferH264}
                aria-label="Prefer H.264"
                data-on={draft.preferH264}
                className="switch"
                onClick={() => setDraft({ ...draft, preferH264: !draft.preferH264 })}
              >
                <span className="switch-knob" />
              </button>
            </div>
          </section>

          <section className="mt-6">
            <div className="mono-label mb-2">03 / Local setup</div>
            <div className="border border-[var(--line-strong)] bg-[var(--paper)] p-3 font-mono text-[11px]">
              <VersionRow label="Clipshed" value={health?.appVersion ?? "dev"} ok={Boolean(health?.appVersion)} />
              <VersionRow label="yt-dlp" value={health?.ytdlpVersion ?? "missing"} ok={Boolean(health?.ytdlpVersion)} />
              <VersionRow label="ffmpeg" value={ffmpegShort ?? "missing"} ok={Boolean(health?.ffmpegVersion)} />
              <VersionRow label="Node" value={health?.nodeVersion ?? "unknown"} ok={Boolean(health?.nodeVersion)} />
            </div>

            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-[11px] leading-relaxed text-[var(--ink-mute)]">Keep yt-dlp fresh; sites change often.</p>
              <button
                type="button"
                onClick={() => void handleUpdate()}
                disabled={updating || !health?.binariesOk}
                className="btn-secondary h-8 shrink-0 gap-1.5 px-2.5 text-[10px]"
              >
                {updating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Update yt-dlp
              </button>
            </div>

            {updateOutput ? (
              <pre className="scrollbar-thin mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words border border-[var(--line)] bg-[var(--paper)] p-2.5 font-mono text-[11px] leading-relaxed text-[var(--ink-soft)]">
                {updateOutput}
              </pre>
            ) : null}
          </section>

          {saveError ? (
            <div className="mt-4 flex items-start gap-2 border-l-2 border-l-[var(--red)] bg-[var(--paper)] px-3 py-2 text-[12px] leading-relaxed text-[var(--red)]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {saveError}
            </div>
          ) : null}

          {health?.cookiesConfigured ? (
            <div className="mt-4 flex items-center gap-2 font-mono text-[11px] text-[var(--green)]">
              <CheckCircle className="h-3.5 w-3.5" />
              Cookies are configured.
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--line-strong)] px-5 py-3.5 sm:px-6">
          <button type="button" onClick={onClose} className="btn-secondary h-10 px-4 text-[11px]">
            Cancel
          </button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} className="btn-primary h-10 min-w-[110px] px-5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

function VersionRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] py-1 last:border-b-0">
      <span className="text-[var(--ink-mute)]">{label}</span>
      <span className={cn("truncate", ok ? "text-[var(--ink-soft)]" : "text-[var(--red)]")}>{value}</span>
    </div>
  );
}
