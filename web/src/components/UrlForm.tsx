import { useState, type FormEvent } from "react";
import { Clipboard, Link2, Loader2, Search } from "lucide-react";
import { api } from "../lib/api";

interface UrlFormProps {
  url: string;
  onUrlChange: (url: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  loading: boolean;
}

export function UrlForm({ url, onUrlChange, onSubmit, onClear, loading }: UrlFormProps) {
  const [pasteState, setPasteState] = useState<"idle" | "pasted" | "failed">("idle");
  const isAndroid = /Android/i.test(navigator.userAgent);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!url.trim() || loading) return;
    onSubmit();
  };

  const showPasteState = (state: "pasted" | "failed") => {
    setPasteState(state);
    window.setTimeout(() => setPasteState("idle"), 1400);
  };

  const handlePaste = async () => {
    try {
      let text: string | null = null;

      // Android WebViews often deny the async clipboard API. The local
      // Kotlin server can read the device clipboard while the app is focused.
      if (isAndroid) {
        try {
          text = (await api.readClipboard()).text;
        } catch (error) {
          console.warn("Native clipboard read failed", error);
        }
      }

      if (!text?.trim()) {
        try {
          text = await navigator.clipboard.readText();
        } catch (error) {
          console.warn("Web clipboard read failed", error);
        }
      }

      const trimmed = text?.trim();
      if (trimmed) {
        onUrlChange(trimmed);
        showPasteState("pasted");
      } else {
        showPasteState("failed");
      }
    } catch {
      showPasteState("failed");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-2 flex items-center justify-between">
        <label htmlFor="source-url" className="mono-label">
          Source link
        </label>
        <div className="flex items-center gap-3">
          {url.trim() ? (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex min-h-6 items-center px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-mute)] transition hover:text-[var(--red)]"
              title="Clear this video and start over"
            >
              Clear
            </button>
          ) : null}
          <span className="font-mono text-[12px] text-[var(--ink-mute)]">URL</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="url-group flex-1">
          <div className="relative flex min-w-0 flex-1 items-center">
            <Link2 className="pointer-events-none absolute left-3.5 h-4 w-4 text-[var(--ink-mute)]" />
            <input
              id="source-url"
              value={url}
              onChange={(event) => onUrlChange(event.target.value)}
              placeholder="https://…"
              className="h-full w-full bg-transparent pl-10 pr-3 font-mono text-[15px] outline-none"
              spellCheck={false}
              autoComplete="off"
              aria-label="Video URL"
            />
          </div>
          <button
            type="button"
            onClick={() => void handlePaste()}
            className="flex shrink-0 items-center gap-1 border-l border-[var(--ink)] px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-soft)] transition hover:bg-[var(--ink)] hover:text-[var(--paper-raised)]"
            title="Paste from clipboard"
          >
            <Clipboard className="h-3 w-3" />
            {pasteState === "pasted" ? "Pasted" : pasteState === "failed" ? "Failed" : "Paste"}
          </button>
        </div>

        <button type="submit" disabled={!url.trim() || loading} className="btn-primary h-12 shrink-0 px-5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {loading ? "Reading" : "Fetch video"}
        </button>
      </div>

      <p className="mt-2 font-mono text-[11px] tracking-[0.06em] text-[var(--ink-mute)]">
        SINGLE VIDEOS ONLY / PLAYLISTS NOT SUPPORTED YET
      </p>
    </form>
  );
}
