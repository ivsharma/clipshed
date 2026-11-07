import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  FileText,
  Globe2,
  Loader2,
  RefreshCw,
  Shield,
  X,
} from "lucide-react";
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

const MODES: Array<{
  id: CookiesMode;
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: "none",
    title: "No cookies",
    description: "Works for most public videos.",
    icon: Shield,
  },
  {
    id: "file",
    title: "Cookies file",
    description: "Point to an exported cookies.txt.",
    icon: FileText,
  },
  {
    id: "browser",
    title: "From browser",
    description: "Read cookies from a local browser.",
    icon: Globe2,
  },
];

const BROWSERS: CookiesBrowser[] = [
  "chrome",
  "edge",
  "firefox",
  "brave",
  "chromium",
  "opera",
  "vivaldi",
];

export function SettingsDialog({
  open,
  onClose,
  settings,
  health,
  saving,
  onSave,
  onUpdateYtDlp,
}: SettingsDialogProps) {
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
        <div className="panel flex items-center gap-3 px-5 py-4 text-sm text-zinc-400">
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
    ? health.ffmpegVersion.match(/ffmpeg version (\S+)/)?.[1] ??
      health.ffmpegVersion.slice(0, 36)
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="panel animate-fade-in max-h-[92vh] w-full max-w-xl overflow-hidden rounded-b-none sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-white/7 px-5 py-4 sm:px-6">
          <div>
            <h2 id="settings-title" className="text-base font-semibold text-white">
              Settings
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Local configuration for yt-dlp.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost h-9 w-9"
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scrollbar-thin max-h-[calc(92vh-140px)] space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">
                  YouTube access
                </h3>
                <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
                  Cookies help with age-restricted, private, or bot-checked
                  videos. They never leave this machine.
                </p>
              </div>
              <span className="badge shrink-0">
                {health?.cookiesConfigured ? "Configured" : "Optional"}
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {MODES.map((mode) => {
                const Icon = mode.icon;
                const selected = draft.cookiesMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        cookiesMode: mode.id,
                      })
                    }
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition",
                      selected
                        ? "border-orange-400/35 bg-orange-400/[0.07]"
                        : "border-white/8 bg-white/[0.02] hover:border-white/15",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4",
                        selected ? "text-orange-300" : "text-zinc-500",
                      )}
                    />
                    <span>
                      <span className="block text-xs font-semibold text-zinc-200">
                        {mode.title}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-relaxed text-zinc-500">
                        {mode.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {draft.cookiesMode === "file" ? (
              <label className="mt-3 block">
                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                  cookies.txt path
                </span>
                <input
                  value={draft.cookiesFile}
                  onChange={(event) =>
                    setDraft({ ...draft, cookiesFile: event.target.value })
                  }
                  className="field h-11 px-3 text-xs"
                  placeholder="C:\Users\you\cookies.txt"
                  spellCheck={false}
                />
              </label>
            ) : null}

            {draft.cookiesMode === "browser" ? (
              <label className="mt-3 block">
                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                  Browser
                </span>
                <select
                  value={draft.cookiesBrowser}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      cookiesBrowser: event.target.value as CookiesBrowser,
                    })
                  }
                  className="field h-11 px-3 text-xs"
                >
                  {BROWSERS.map((browser) => (
                    <option key={browser} value={browser}>
                      {browser[0].toUpperCase() + browser.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </section>

          <section className="rounded-xl border border-white/7 bg-white/[0.025] p-3.5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xs font-semibold text-zinc-200">
                  Prefer H.264
                </h3>
                <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
                  Best compatibility with older players. YouTube offers H.264 up
                  to 1080p; higher resolutions use VP9/AV1.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={draft.preferH264}
                aria-label="Prefer H.264"
                data-on={draft.preferH264}
                className="switch"
                onClick={() =>
                  setDraft({ ...draft, preferH264: !draft.preferH264 })
                }
              >
                <span className="switch-knob" />
              </button>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-zinc-200">
              Local setup
            </h3>
            <div className="space-y-1.5 rounded-xl border border-white/7 bg-black/20 p-3 font-mono text-[10px] text-zinc-500">
              <VersionRow
                label="yt-dlp"
                value={health?.ytdlpVersion ?? "missing"}
                ok={Boolean(health?.ytdlpVersion)}
              />
              <VersionRow
                label="ffmpeg"
                value={ffmpegShort ?? "missing"}
                ok={Boolean(health?.ffmpegVersion)}
              />
              <VersionRow
                label="Node"
                value={health?.nodeVersion ?? "unknown"}
                ok={Boolean(health?.nodeVersion)}
              />
            </div>

            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-[10px] leading-relaxed text-zinc-600">
                Keep yt-dlp fresh; YouTube changes often.
              </p>
              <button
                type="button"
                onClick={() => void handleUpdate()}
                disabled={updating || !health?.binariesOk}
                className="btn-secondary h-8 shrink-0 gap-1.5 px-2.5 text-[11px]"
              >
                {updating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Update yt-dlp
              </button>
            </div>

            {updateOutput ? (
              <pre className="scrollbar-thin mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/7 bg-black/30 p-2.5 font-mono text-[10px] leading-relaxed text-zinc-500">
                {updateOutput}
              </pre>
            ) : null}
          </section>

          {saveError ? (
            <div className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-red-200/80">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {saveError}
            </div>
          ) : null}

          {health?.cookiesConfigured ? (
            <div className="flex items-center gap-2 text-[11px] text-emerald-300/70">
              <CheckCircle className="h-3.5 w-3.5" />
              Cookies are configured.
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/7 bg-black/15 px-5 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary h-10 px-4 text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="btn-primary h-10 min-w-[110px] px-5 text-xs"
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              "Save settings"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function VersionRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-zinc-600">{label}</span>
      <span className={cn("truncate", ok ? "text-zinc-400" : "text-amber-400/80")}>
        {value}
      </span>
    </div>
  );
}
