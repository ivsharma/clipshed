import { FileVideo, Scissors, Shield, Sparkles, type LucideIcon } from "lucide-react";
import { UrlForm } from "./UrlForm";
import { ProbeSkeleton } from "./VideoCard";

interface LandingProps {
  url: string;
  onUrlChange: (url: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

const FEATURES: Array<{ icon: LucideIcon; title: string; description: string }> = [
  {
    icon: Scissors,
    title: "Time-range clipping",
    description: "Grab a 5-minute section from a 2-hour video without downloading the rest.",
  },
  {
    icon: FileVideo,
    title: "MP4, MP3, or both",
    description: "Merge the best video and audio into MP4, extract clean audio, or get both from one download.",
  },
  {
    icon: Shield,
    title: "Local & private",
    description: "yt-dlp and ffmpeg run on this machine. No account, no cloud, no uploads.",
  },
];

export function Landing({ url, onUrlChange, onSubmit, loading }: LandingProps) {
  return (
    <section className="mx-auto max-w-3xl text-center">
      <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/[0.06] px-3 py-1.5 text-[11px] font-semibold text-orange-200/80">
        <Sparkles className="h-3.5 w-3.5" />
        YouTube · Facebook · Instagram → MP4 / MP3
      </div>

      <h1 className="text-balance text-4xl font-bold leading-[1.05] tracking-[-0.04em] text-white sm:text-6xl">
        Clip exactly
        <span className="bg-gradient-to-r from-red-400 via-orange-400 to-amber-300 bg-clip-text text-transparent">
          {" "}
          what you need.
        </span>
      </h1>

      <p className="mx-auto mt-5 max-w-xl text-pretty text-sm leading-relaxed text-zinc-400 sm:text-base">
        Paste a video link, choose MP4 or MP3, and download the whole video — or just the part from 15:00 to 20:00.
        Only the selected range is fetched.
      </p>

      <div className="panel mt-8 p-4 text-left sm:p-5">
        <UrlForm url={url} onUrlChange={onUrlChange} onSubmit={onSubmit} loading={loading} />
      </div>

      {loading ? <ProbeSkeleton /> : null}

      <div className="mt-8 grid gap-3 text-left sm:grid-cols-3">
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <div key={feature.title} className="panel-soft p-4">
              <div className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-orange-300">
                <Icon className="h-4 w-4" />
              </div>
              <h3 className="text-xs font-semibold text-zinc-200">{feature.title}</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{feature.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
