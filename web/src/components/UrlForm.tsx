import { useState, type FormEvent } from "react";
import { Clipboard, Link2, Loader2, Search } from "lucide-react";

interface UrlFormProps {
  url: string;
  onUrlChange: (url: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

export function UrlForm({ url, onUrlChange, onSubmit, loading }: UrlFormProps) {
  const [pasted, setPasted] = useState(false);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!url.trim() || loading) return;
    onSubmit();
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        onUrlChange(text.trim());
        setPasted(true);
        window.setTimeout(() => setPasted(false), 1400);
      }
    } catch {
      // Clipboard permission is optional; manual paste still works.
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-2 flex items-center justify-between">
        <label htmlFor="source-url" className="mono-label">
          Source link
        </label>
        <span className="font-mono text-[12px] text-[var(--ink-mute)]">URL</span>
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
            {pasted ? "Pasted" : "Paste"}
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
