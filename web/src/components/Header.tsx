import { Scissors, Settings2 } from "lucide-react";
import type { Health } from "@clipshed/shared";
import { cn } from "../lib/cn";

interface HeaderProps {
  health: Health | null;
  onOpenSettings: () => void;
  onHome: () => void;
}

export function Header({ health, onOpenSettings, onHome }: HeaderProps) {
  const ready = Boolean(health?.binariesOk);

  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 pt-6 sm:px-6 sm:pt-8">
      <button
        type="button"
        onClick={onHome}
        className="group flex items-center gap-3 text-left"
        aria-label="Clipshed home"
      >
        <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 shadow-[0_10px_30px_rgba(239,68,68,0.28)] transition-transform duration-200 group-hover:-rotate-3 group-hover:scale-105">
          <Scissors className="h-5 w-5 text-white" strokeWidth={2.4} />
          <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#08090d] bg-emerald-400" />
        </span>
        <span className="leading-tight">
          <span className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-white">
              Clipshed
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] text-zinc-400">
              LOCAL
            </span>
          </span>
          <span className="hidden text-xs text-zinc-500 sm:block">
            Video → MP4 / MP3 · time-range clipping
          </span>
        </span>
      </button>

      <div className="flex items-center gap-2">
        <div
          className={cn(
            "hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium sm:flex",
            ready
              ? "border-emerald-400/15 bg-emerald-400/5 text-emerald-300/80"
              : "border-amber-400/20 bg-amber-400/5 text-amber-300/80",
          )}
          title={
            health
              ? `yt-dlp: ${health.ytdlpVersion ?? "missing"}\nffmpeg: ${health.ffmpegVersion ?? "missing"}`
              : "Checking local binaries"
          }
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              ready ? "bg-emerald-400" : "animate-pulse bg-amber-400",
            )}
          />
          <span className="max-w-[220px] truncate">
            {health
              ? ready
                ? `yt-dlp ${health.ytdlpVersion ?? "ready"}`
                : "Setup needed"
              : "Checking setup…"}
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenSettings}
          className="btn-secondary h-10 w-10 rounded-xl p-0"
          aria-label="Open settings"
          title="Settings"
        >
          <Settings2 className="h-[18px] w-[18px]" />
        </button>
      </div>
    </header>
  );
}
