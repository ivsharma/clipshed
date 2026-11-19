import { UrlForm } from "./UrlForm";
import { ProbeSkeleton } from "./VideoCard";

interface LandingProps {
  url: string;
  onUrlChange: (url: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  loading: boolean;
}

const NOTES = [
  ["01", "Paste a link", "YouTube, Facebook, or Instagram."],
  ["02", "Mark in and out", "Type the times or drag the range handles."],
  ["03", "Take the file", "MP4, MP3, or both from one range."],
];

const CAPABILITIES = [
  ["RANGE FIRST", "Only the selected section is fetched. Not the full hour."],
  ["TWO OUTPUTS", "Both mode downloads once and extracts the MP3 from the same source."],
  ["LOCAL ONLY", "yt-dlp and ffmpeg run here. No account, no cloud, no uploads."],
];

const SOURCES = [
  { name: "YOUTUBE", status: "Stable", stable: true },
  { name: "FACEBOOK", status: "Experimental", stable: false },
  { name: "INSTAGRAM", status: "Experimental", stable: false },
];

export function Landing({ url, onUrlChange, onSubmit, onClear, loading }: LandingProps) {
  return (
    <section>
      <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
        <div>
          <div className="mb-6 flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.16em] text-[var(--ink-soft)]">
            <span className="h-2 w-2 bg-[var(--red)]" />
            ISSUE 01 / LOCAL VIDEO CLIPPER
          </div>

          <h1 className="display text-[3.4rem] leading-[0.92] text-[var(--ink)] sm:text-[5.2rem]">
            Clip exactly
            <br />
            <span className="italic text-[var(--red)]">what you need.</span>
          </h1>

          <p className="mt-6 max-w-xl text-[16px] leading-7 text-[var(--ink-soft)]">
            Paste a video link and keep only the part you actually want. Set a range like{" "}
            <span className="font-mono text-[14px] text-[var(--ink)]">15:00 — 20:00</span>, choose MP4, MP3, or both,
            and Clipshed fetches just that section.
          </p>

          <div className="mt-8 border-t border-[var(--line-strong)] pt-6">
            <UrlForm url={url} onUrlChange={onUrlChange} onSubmit={onSubmit} onClear={onClear} loading={loading} />
          </div>

          {loading ? <ProbeSkeleton /> : null}

          <div className="mt-8 border-t border-[var(--line-strong)] pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="mono-label">Supported sources</span>
              <div className="flex items-center gap-3 font-mono text-[10px] text-[var(--ink-mute)]">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 bg-[var(--green)]" />
                  Stable
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 bg-[var(--amber)]" />
                  Experimental
                </span>
              </div>
            </div>

            <div className="mt-3 grid border border-[var(--line-strong)] sm:grid-cols-3">
              {SOURCES.map((source, index) => (
                <div
                  key={source.name}
                  className={`flex items-center justify-between gap-2 px-3 py-2 ${
                    index > 0 ? "border-t border-[var(--line)] sm:border-l sm:border-t-0" : ""
                  }`}
                >
                  <span className="font-mono text-[11px] font-semibold tracking-[0.08em] text-[var(--ink)]">
                    {source.name}
                  </span>
                  <span className={source.stable ? "badge badge-success" : "badge badge-warning"}>{source.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="panel flex flex-col p-5 sm:p-6">
          <div className="flex items-center justify-between border-b border-[var(--line-strong)] pb-3">
            <span className="mono-label">Operating notes</span>
            <span className="font-mono text-[11px] text-[var(--ink-mute)]">NO. 001</span>
          </div>

          <ol className="divide-y divide-[var(--line)]">
            {NOTES.map(([number, title, body]) => (
              <li key={number} className="grid grid-cols-[2.2rem_1fr] gap-3 py-4">
                <span className="font-mono text-[12px] font-semibold text-[var(--red)]">{number}</span>
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-mute)]">{body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-3 border border-[var(--line-strong)] bg-[var(--paper)] p-4">
            <div className="mono-label">Example range</div>
            <div className="mt-2 font-mono text-2xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
              15:00 <span className="text-[var(--red)]">→</span> 20:00
            </div>
            <div className="mt-2 text-[12px] leading-relaxed text-[var(--ink-mute)]">
              5 minutes fetched. 55 minutes left on the server.
            </div>
          </div>

          <div className="mt-auto flex items-center justify-between pt-5">
            <span className="stamp">LOCAL ONLY</span>
            <span className="font-mono text-[11px] text-[var(--ink-mute)]">EST. 2026</span>
          </div>
        </aside>
      </div>

      <div className="mt-14 grid border-t border-[var(--line-strong)] sm:grid-cols-3">
        {CAPABILITIES.map(([title, body], index) => (
          <div key={title} className={`py-5 sm:px-5 ${index > 0 ? "border-t border-[var(--line)] sm:border-l sm:border-t-0" : ""}`}>
            <div className="mono-label text-[var(--red)]">{title}</div>
            <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-[var(--ink-soft)]">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
