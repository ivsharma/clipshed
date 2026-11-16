import { Scissors, Settings2 } from "lucide-react";
import type { Health } from "@clipshed/shared";

interface HeaderProps {
  health: Health | null;
  onOpenSettings: () => void;
  onHome: () => void;
}

export function Header({ health, onOpenSettings, onHome }: HeaderProps) {
  const ready = Boolean(health?.binariesOk);

  return (
    <header className="border-b border-[var(--line-strong)]">
      <div className="mx-auto flex w-full max-w-6xl items-end justify-between gap-4 px-4 pb-4 pt-5 sm:px-6 sm:pt-7">
        <button type="button" onClick={onHome} className="group flex items-end gap-3 text-left" aria-label="Clipshed home">
          <span className="relative flex h-10 w-10 items-center justify-center border border-[var(--ink)] bg-[var(--red)] transition-transform duration-150 group-hover:-translate-y-0.5">
            <Scissors className="h-[18px] w-[18px] text-[var(--on-red)]" strokeWidth={2.4} />
            <span className="absolute -bottom-1 -right-1 h-2.5 w-2.5 border border-[var(--ink)] bg-[var(--paper-raised)]" />
          </span>

          <span className="leading-none">
            <span className="flex items-baseline gap-2">
              <span className="font-mono text-lg font-bold tracking-[0.18em] text-[var(--ink)]">CLIPSHED</span>
              <span className="hidden border border-[var(--line-strong)] px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-[var(--ink-soft)] sm:inline">
                LOCAL
              </span>
            </span>
            <span className="mt-1.5 hidden font-mono text-[11px] tracking-[0.12em] text-[var(--ink-mute)] sm:block">
              VIDEO RANGE CLIPPER / MP4 · MP3
            </span>
          </span>
        </button>

        <div className="flex items-center gap-2">
          <div
            className="hidden items-center gap-2 border border-[var(--line-strong)] px-2.5 py-1.5 font-mono text-[11px] tracking-[0.06em] text-[var(--ink-soft)] sm:flex"
            title={
              health
                ? `yt-dlp: ${health.ytdlpVersion ?? "missing"}\nffmpeg: ${health.ffmpegVersion ?? "missing"}`
                : "Checking local binaries"
            }
          >
            <span className={`h-2 w-2 ${ready ? "bg-[var(--green)]" : "bg-[var(--amber)]"}`} />
            <span className="max-w-[220px] truncate">
              {health ? (ready ? `YT-DLP ${health.ytdlpVersion ?? "READY"}` : "SETUP NEEDED") : "CHECKING…"}
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenSettings}
            className="btn-secondary h-9 w-9 p-0"
            aria-label="Open settings"
            title="Settings"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
