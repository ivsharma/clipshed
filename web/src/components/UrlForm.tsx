import { useState, type FormEvent } from "react";
import { Clipboard, Link2, Loader2, Search } from "lucide-react";
import { cn } from "../lib/cn";

interface UrlFormProps {
  url: string;
  onUrlChange: (url: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

export function UrlForm({ url, onUrlChange, onSubmit, loading }: UrlFormProps) {
  const [pasteState, setPasteState] = useState<"idle" | "copied">("idle");

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
        setPasteState("copied");
        window.setTimeout(() => setPasteState("idle"), 1400);
      }
    } catch {
      // Clipboard permission can be denied; the user can paste manually.
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-zinc-500" />
          <input
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
            placeholder="Paste a YouTube, Facebook, or Instagram link"
            className="field h-14 pl-11 pr-24 text-sm sm:text-[15px]"
            spellCheck={false}
            autoComplete="off"
            aria-label="Video URL"
          />
          <button
            type="button"
            onClick={() => void handlePaste()}
            className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
            title="Paste from clipboard"
          >
            <Clipboard className="h-3.5 w-3.5" />
            {pasteState === "copied" ? "Pasted" : "Paste"}
          </button>
        </div>

        <button
          type="submit"
          disabled={!url.trim() || loading}
          className={cn("btn-primary h-14 shrink-0 px-6 text-sm sm:min-w-[132px]")}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading…
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              Fetch video
            </>
          )}
        </button>
      </div>

      <p className="px-1 text-xs leading-relaxed text-zinc-500">
        Single videos, Shorts, and livestream replays. Playlists aren&apos;t
        supported yet. Your links and files stay on this machine.
      </p>
    </form>
  );
}
