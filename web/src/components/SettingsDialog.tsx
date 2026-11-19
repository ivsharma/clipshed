import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { AlertTriangle, CheckCircle, Contrast, ExternalLink, FileText, Globe2, Loader2, Moon, RefreshCw, Shield, Sun, X } from "lucide-react";
import type { CookiesBrowser, CookiesMode, Health, Settings, UpdateCheck } from "@clipshed/shared";
import type { LucideIcon } from "lucide-react";
import type { Theme } from "../lib/theme";
import { cn } from "../lib/cn";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  settings: Settings | null;
  health: Health | null;
  saving: boolean;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onSave: (settings: Settings) => Promise<void>;
  onImportCookies: (filename: string, content: string) => Promise<void>;
  onUpdateYtDlp: () => Promise<{ ok: boolean; output: string }>;
  onCheckUpdates: () => Promise<UpdateCheck>;
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

/** Cookie-based access is temporarily hidden while the workflow is finished. */
const COOKIES_ENABLED = false;

const THEMES: Array<{
  id: Theme;
  title: string;
  description: string;
  icon: LucideIcon;
  swatches: [string, string, string];
}> = [
  {
    id: "light",
    title: "Light",
    description: "Warm paper, ink, and red.",
    icon: Sun,
    swatches: ["#f1eee6", "#141310", "#d93a1f"],
  },
  {
    id: "dark",
    title: "Dark",
    description: "Warm charcoal with softer ink and borders.",
    icon: Moon,
    swatches: ["#1d1a16", "#ded7c8", "#e2664c"],
  },
  {
    id: "dark-contrast",
    title: "Dark contrast",
    description: "Black and white with maximum legibility.",
    icon: Contrast,
    swatches: ["#050505", "#ffffff", "#ff4a2a"],
  },
];

export function SettingsDialog({ open, onClose, settings, health, saving, theme, onThemeChange, onSave, onImportCookies, onUpdateYtDlp, onCheckUpdates }: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Settings | null>(settings);
  const [updating, setUpdating] = useState(false);
  const [updateOutput, setUpdateOutput] = useState<string | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateCheck, setUpdateCheck] = useState<UpdateCheck | null>(null);
  const [updateCheckError, setUpdateCheckError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const isAndroid = /Android/i.test(navigator.userAgent);
  const modes = isAndroid ? MODES.filter((mode) => mode.id !== "browser") : MODES;

  useEffect(() => {
    if (!open || !settings) return;
    const nextMode =
      !COOKIES_ENABLED || (isAndroid && settings.cookiesMode === "browser")
        ? "none"
        : settings.cookiesMode;
    setDraft({ ...settings, cookiesMode: nextMode });
  }, [open, settings, isAndroid]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();

    return () => {
      if (dialog?.open) dialog.close();
    };
  }, [open]);

  // `closedby` is progressive enhancement. Chromium 134+ handles light dismiss
  // natively; this covers the older Android WebViews the app supports.
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog || "closedBy" in HTMLDialogElement.prototype) return;

    const isOutside = (event: PointerEvent): boolean => {
      const rect = dialog.getBoundingClientRect();
      return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    };
    let pressedOutside = false;
    const onPointerDown = (event: PointerEvent) => {
      pressedOutside = isOutside(event);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (pressedOutside && isOutside(event)) dialog.close();
      pressedOutside = false;
    };

    dialog.addEventListener("pointerdown", onPointerDown);
    dialog.addEventListener("pointerup", onPointerUp);
    return () => {
      dialog.removeEventListener("pointerdown", onPointerDown);
      dialog.removeEventListener("pointerup", onPointerUp);
    };
  }, [open]);

  const closeDialog = () => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    else onClose();
  };

  if (!open) return null;

  if (!draft) {
    return (
      <dialog
        ref={dialogRef}
        aria-labelledby="settings-loading-title"
        className="settings-dialog panel"
        {...({ closedby: "any" } as Record<string, string>)}
      >
        <h2 id="settings-loading-title" className="sr-only">
          Loading settings
        </h2>
        <div className="flex items-center gap-3 px-5 py-4 font-mono text-[12px] text-[var(--ink-soft)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading settings…
        </div>
      </dialog>
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

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true);
    setUpdateCheckError(null);
    try {
      setUpdateCheck(await onCheckUpdates());
    } catch (error) {
      setUpdateCheckError(error instanceof Error ? error.message : "Could not check for updates.");
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleImportCookies = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    setImportError(null);
    try {
      const content = await file.text();
      await onImportCookies(file.name, content);
      setDraft((current) => (current ? { ...current, cookiesMode: "file" } : current));
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not import cookies.txt.");
    } finally {
      setImporting(false);
    }
  };

  const checkedAtLabel = updateCheck
    ? new Date(updateCheck.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;
  const publishedLabel = updateCheck?.latest?.publishedAt
    ? new Date(updateCheck.latest.publishedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  const ffmpegShort = health?.ffmpegVersion
    ? (health.ffmpegVersion.match(/ffmpeg version (\S+)/)?.[1] ?? health.ffmpegVersion.slice(0, 36))
    : null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="settings-title"
      className="settings-dialog panel animate-fade-in shadow-[8px_8px_0_var(--shadow)]"
      {...({ closedby: "any" } as Record<string, string>)}
    >
      <div className="flex shrink-0 items-start justify-between border-b border-[var(--line-strong)] px-5 py-4 sm:px-6">
        <div>
          <div className="mono-label text-[var(--red)]">Local settings</div>
          <h2 id="settings-title" className="display mt-1 text-3xl text-[var(--ink)]">
            Settings
          </h2>
        </div>
        <button type="button" onClick={closeDialog} className="btn-secondary h-8 w-8 p-0" aria-label="Close settings" autoFocus>
          <X className="h-4 w-4" />
        </button>
      </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <section>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <div className="mono-label">01 / Site access</div>
                <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-[var(--ink-mute)]">
                  Cookie-based sign-in is coming soon. Public videos work without cookies.
                </p>
              </div>
              <span className="badge shrink-0">
                {COOKIES_ENABLED ? (health?.cookiesConfigured ? "Configured" : "Optional") : "Coming soon"}
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {modes.map((mode) => {
                const Icon = mode.icon;
                const selected = draft.cookiesMode === mode.id;
                const unavailable = !COOKIES_ENABLED && mode.id !== "none";
                return (
                  <button
                    key={mode.id}
                    type="button"
                    disabled={unavailable}
                    aria-disabled={unavailable}
                    onClick={() => setDraft({ ...draft, cookiesMode: mode.id })}
                    className={cn(
                      "flex flex-col items-start gap-2 border p-3 text-left transition",
                      selected
                        ? "border-[var(--red)] bg-[var(--red-soft)]"
                        : unavailable
                          ? "cursor-not-allowed border-dashed border-[var(--line-strong)] bg-[var(--paper)] opacity-55 grayscale"
                          : "border-[var(--line-strong)] bg-[var(--paper-raised)] hover:border-[var(--ink)]",
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <Icon className={selected ? "h-4 w-4 text-[var(--red)]" : "h-4 w-4 text-[var(--ink-mute)]"} />
                      {unavailable ? (
                        <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ink-mute)]">
                          Soon
                        </span>
                      ) : null}
                    </span>
                    <span>
                      <span className="block text-[12px] font-semibold text-[var(--ink)]">{mode.title}</span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--ink-mute)]">{mode.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {!COOKIES_ENABLED ? (
              <div className="mt-3 border border-dashed border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-mute)]">
                  Cookie sign-in · coming soon
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-mute)]">
                  Age-restricted, private, and login-required videos will need cookies later. Public videos work
                  without them.
                </p>
              </div>
            ) : null}

            {COOKIES_ENABLED && draft.cookiesMode === "file" ? (
              <div className="mt-3">
                {isAndroid ? (
                  <div>
                    <p className="mb-2 text-[11px] leading-relaxed text-[var(--ink-mute)]">
                      Import a Netscape-format cookies.txt exported from a browser. It is saved only on this device.
                    </p>
                    <label className="btn-secondary h-10 cursor-pointer px-3 text-[11px]">
                      <input
                        type="file"
                        accept=".txt,text/plain"
                        className="hidden"
                        disabled={importing}
                        onChange={(event) => void handleImportCookies(event)}
                      />
                      {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                      {importing ? "Importing…" : "Import cookies.txt"}
                    </label>
                    {draft.cookiesFile ? (
                      <p className="mt-2 break-all font-mono text-[10px] leading-relaxed text-[var(--ink-mute)]">
                        Imported: {draft.cookiesFile}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <label className="block">
                    <span className="mono-label mb-1.5 block">cookies.txt path</span>
                    <input
                      value={draft.cookiesFile}
                      onChange={(event) => setDraft({ ...draft, cookiesFile: event.target.value })}
                      className="field h-10 px-3 font-mono text-[12px]"
                      placeholder="C:\Users\you\cookies.txt"
                      spellCheck={false}
                    />
                  </label>
                )}
                {importError ? (
                  <div className="mt-2 flex items-start gap-2 border-l-2 border-l-[var(--red)] bg-[var(--paper)] px-3 py-2 text-[11px] leading-relaxed text-[var(--red)]">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {importError}
                  </div>
                ) : null}
              </div>
            ) : null}

            {COOKIES_ENABLED && draft.cookiesMode === "browser" ? (
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

          <section className="mt-6">
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <div className="mono-label">04 / Appearance</div>
                <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-[var(--ink-mute)]">
                  Choose a palette. It applies immediately and is saved on this device.
                </p>
              </div>
              <span className="badge shrink-0">{THEMES.find((option) => option.id === theme)?.title ?? "Light"}</span>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {THEMES.map((option) => {
                const Icon = option.icon;
                const selected = theme === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onThemeChange(option.id)}
                    aria-pressed={selected}
                    className={cn(
                      "flex flex-col items-start gap-2 border p-3 text-left transition",
                      selected
                        ? "border-[var(--red)] bg-[var(--red-soft)]"
                        : "border-[var(--line-strong)] bg-[var(--paper-raised)] hover:border-[var(--ink)]",
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <Icon className={selected ? "h-4 w-4 text-[var(--red)]" : "h-4 w-4 text-[var(--ink-mute)]"} />
                      <span className="flex h-4 w-14 overflow-hidden border border-[var(--line-strong)]" aria-hidden="true">
                        {option.swatches.map((color) => (
                          <span key={color} className="flex-1" style={{ background: color }} />
                        ))}
                      </span>
                    </span>
                    <span>
                      <span className="block text-[12px] font-semibold text-[var(--ink)]">{option.title}</span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--ink-mute)]">
                        {option.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-6">
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <div className="mono-label">05 / Updates</div>
                <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-[var(--ink-mute)]">
                  Check the public GitHub releases. Nothing is downloaded automatically.
                </p>
              </div>
              <span className="badge shrink-0">GitHub</span>
            </div>

            <div className="border border-[var(--line-strong)] bg-[var(--paper)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="mono-label">Current version</div>
                  <div className="mt-1 font-mono text-[13px] text-[var(--ink)]">
                    {updateCheck?.currentVersion ?? health?.appVersion ?? "dev"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCheckUpdates()}
                  disabled={checkingUpdates}
                  className="btn-secondary h-9 shrink-0 gap-1.5 px-3 text-[10px]"
                >
                  {checkingUpdates ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  {checkingUpdates ? "Checking…" : "Check for updates"}
                </button>
              </div>

              {updateCheck ? (
                <div className="mt-3 border-t border-[var(--line)] pt-3">
                  {updateCheck.latest ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={cn("badge", updateCheck.updateAvailable ? "badge-accent" : "badge-success")}>
                            {updateCheck.updateAvailable ? "Update available" : "Up to date"}
                          </span>
                          {updateCheck.latest.prerelease ? (
                            <span className="badge badge-warning">Pre-release</span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-[12px] leading-relaxed text-[var(--ink-soft)]">
                          {updateCheck.updateAvailable
                            ? `Clipshed ${updateCheck.latest.version} is available. You're running ${updateCheck.currentVersion}.`
                            : `You're running the latest release (${updateCheck.latest.version}).`}
                        </p>
                        <p className="mt-1 font-mono text-[10px] leading-relaxed text-[var(--ink-mute)]">
                          {updateCheck.latest.name}
                          {publishedLabel ? ` · ${publishedLabel}` : ""}
                          {checkedAtLabel ? ` · checked ${checkedAtLabel}` : ""}
                        </p>
                      </div>

                      {updateCheck.updateAvailable ? (
                        <a
                          href={updateCheck.latest.url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-primary h-9 shrink-0 gap-1.5 px-3 text-[10px]"
                        >
                          Open release
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <CheckCircle className="h-4 w-4 shrink-0 text-[var(--green)]" />
                      )}
                    </div>
                  ) : (
                    <p className="text-[12px] leading-relaxed text-[var(--ink-mute)]">
                      No published releases were found.
                    </p>
                  )}
                </div>
              ) : null}

              {updateCheckError ? (
                <div className="mt-3 flex items-start gap-2 border-l-2 border-l-[var(--red)] bg-[var(--paper-raised)] px-3 py-2 text-[11px] leading-relaxed text-[var(--red)]">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {updateCheckError}
                </div>
              ) : null}
            </div>
          </section>

          {saveError ? (
            <div className="mt-4 flex items-start gap-2 border-l-2 border-l-[var(--red)] bg-[var(--paper)] px-3 py-2 text-[12px] leading-relaxed text-[var(--red)]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {saveError}
            </div>
          ) : null}

          {COOKIES_ENABLED && health?.cookiesConfigured ? (
            <div className="mt-4 flex items-center gap-2 font-mono text-[11px] text-[var(--green)]">
              <CheckCircle className="h-3.5 w-3.5" />
              Cookies are configured.
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--line-strong)] px-5 py-3.5 sm:px-6">
          <button type="button" onClick={closeDialog} className="btn-secondary h-10 px-4 text-[11px]">
            Cancel
          </button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} className="btn-primary h-10 min-w-[110px] px-5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
    </dialog>
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
