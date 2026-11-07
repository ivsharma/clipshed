import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  FileVideo,
  Loader2,
  Scissors,
  Shield,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  formatBytes,
  formatClock,
  formatDuration,
  type Health,
  type Job,
  type JobEvent,
  type JobKind,
  type ProbeResult,
  type Settings,
} from "@clipshed/shared";
import { ErrorBanner, type UiError } from "./components/ErrorBanner";
import { FormatPicker } from "./components/FormatPicker";
import { Header } from "./components/Header";
import { HistoryList } from "./components/HistoryList";
import { JobPanel } from "./components/JobPanel";
import { RangeSelector } from "./components/RangeSelector";
import { SettingsDialog } from "./components/SettingsDialog";
import { UrlForm } from "./components/UrlForm";
import { VideoCard } from "./components/VideoCard";
import { useJobEvents } from "./hooks/useJobEvents";
import { ApiError, api } from "./lib/api";
import {
  estimateSizes,
  selectedDurationLabel,
} from "./lib/format";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

function toUiError(error: unknown): UiError {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      code: error.code,
      details: error.details,
    };
  }
  if (error instanceof Error) return { message: error.message };
  return { message: "Something went wrong." };
}

export default function App() {
  const [url, setUrl] = useState("");
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);

  const [kind, setKind] = useState<JobKind>("mp4");
  const [height, setHeight] = useState<number | null>(null);
  const [bitrate, setBitrate] = useState(192);
  const [fullVideo, setFullVideo] = useState(true);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [precise, setPrecise] = useState(false);

  const [job, setJob] = useState<Job | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<UiError | null>(null);

  const [history, setHistory] = useState<Job[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const refreshSettings = useCallback(async () => {
    try {
      const payload = await api.getSettings();
      setSettings(payload.settings);
      setHealth(payload.health);
    } catch (requestError) {
      setError(toUiError(requestError));
    }
  }, []);

  const refreshHistory = useCallback(async (silent = false) => {
    if (!silent) setHistoryLoading(true);
    try {
      const payload = await api.listJobs();
      setHistory(payload.jobs);
    } catch (requestError) {
      if (!silent) setError(toUiError(requestError));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSettings();
    void refreshHistory(true);
  }, [refreshSettings, refreshHistory]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleJobEvent = useCallback(
    (event: JobEvent) => {
      setJob(event.job);
      if (TERMINAL.has(event.job.status)) {
        void refreshHistory(true);
      }
    },
    [refreshHistory],
  );

  const jobActive = Boolean(job && !TERMINAL.has(job.status));
  useJobEvents(job?.id ?? null, handleJobEvent, jobActive);

  const estimates = useMemo(() => {
    if (!probe) return { video: null, audio: null, total: null };
    return estimateSizes(
      probe,
      kind,
      height,
      bitrate,
      start,
      end,
      fullVideo,
    );
  }, [probe, kind, height, bitrate, start, end, fullVideo]);

  const estimated = estimates.total;

  const selectedQuality =
    probe?.qualities.find((quality) => quality.height === height) ??
    probe?.qualities[0] ??
    null;

  const selectedLabel = probe
    ? selectedDurationLabel(probe, start, end, fullVideo)
    : "";

  const rangeInvalid = Boolean(
    probe &&
      !fullVideo &&
      (!probe.duration ||
        end <= start ||
        end - start < 1 ||
        end > probe.duration + 1),
  );

  const canStart = Boolean(
    probe &&
      !probe.isLive &&
      !starting &&
      !rangeInvalid &&
      (kind === "mp3" || height !== null),
  );

  const handleProbe = async () => {
    if (!url.trim() || probing) return;

    if (job && !TERMINAL.has(job.status)) {
      void api.cancelJob(job.id).catch(() => undefined);
    }

    setProbing(true);
    setError(null);
    setProbe(null);
    setJob(null);

    try {
      const video = await api.probe(url.trim());
      setProbe(video);

      const defaultHeight =
        video.qualities.find((quality) => quality.height <= 1080)?.height ??
        video.qualities[0]?.height ??
        null;

      setHeight(defaultHeight);
      setKind(defaultHeight === null ? "mp3" : "mp4");
      setBitrate(192);
      setPrecise(false);

      if (
        video.duration &&
        video.suggestedStart !== null &&
        video.suggestedStart > 0 &&
        video.suggestedStart < video.duration
      ) {
        setFullVideo(false);
        setStart(video.suggestedStart);
        setEnd(
          Math.min(
            video.duration,
            video.suggestedStart + 300,
          ),
        );
      } else {
        setFullVideo(true);
        setStart(0);
        setEnd(video.duration ?? 0);
      }
    } catch (requestError) {
      setError(toUiError(requestError));
    } finally {
      setProbing(false);
    }
  };

  const handleKindChange = (nextKind: JobKind) => {
    setKind(nextKind);
    if (nextKind === "mp3") setPrecise(false);

    if (nextKind !== "mp3" && height === null && probe) {
      setHeight(
        probe.qualities.find((quality) => quality.height <= 1080)?.height ??
          probe.qualities[0]?.height ??
          null,
      );
    }
  };

  const handleFullVideoChange = (nextFullVideo: boolean) => {
    setFullVideo(nextFullVideo);

    if (!nextFullVideo && probe?.duration) {
      if (end <= start || end > probe.duration) {
        setStart(0);
        setEnd(probe.duration);
      }
    }
  };

  const handleRangeChange = (nextStart: number, nextEnd: number) => {
    setStart(nextStart);
    setEnd(nextEnd);
  };

  const handleStart = async () => {
    if (!probe) return;

    if (probe.isLive) {
      setError({
        message:
          "Active live streams aren't supported. Try again after the stream ends.",
      });
      return;
    }

    if (!fullVideo) {
      if (!probe.duration) {
        setError({ message: "This video doesn't report a duration." });
        return;
      }
      if (end - start < 1) {
        setError({ message: "Select at least one second." });
        return;
      }
      if (end > probe.duration + 1) {
        setError({ message: "The end time is past the end of the video." });
        return;
      }
    }

    if (kind === "mp4" && height === null) {
      setError({ message: "Pick a video quality first." });
      return;
    }

    setStarting(true);
    setError(null);

    try {
      const created = await api.createJob({
        url: probe.url,
        kind,
        height: kind !== "mp3" ? (height ?? undefined) : undefined,
        bitrate: kind !== "mp4" ? bitrate : undefined,
        range: fullVideo ? null : { start, end },
        precise,
      });

      setJob(created);
      void refreshHistory(true);
      window.requestAnimationFrame(() => {
        document
          .getElementById("job-panel")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (requestError) {
      setError(toUiError(requestError));
    } finally {
      setStarting(false);
    }
  };

  const handleCancel = async () => {
    if (!job) return;
    try {
      const updated = await api.cancelJob(job.id);
      setJob(updated);
    } catch (requestError) {
      setError(toUiError(requestError));
    }
  };

  const handleReset = () => {
    if (job && !TERMINAL.has(job.status)) {
      void api.cancelJob(job.id).catch(() => undefined);
    }

    setProbe(null);
    setJob(null);
    setError(null);
    setUrl("");
    setFullVideo(true);
    setStart(0);
    setEnd(0);
    setPrecise(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleRetry = async () => {
    setJob(null);
    await handleStart();
  };

  const handleDelete = async (target: Job) => {
    if (
      !window.confirm(
        `Delete "${target.title}" and its downloaded file?`,
      )
    ) {
      return;
    }

    try {
      await api.deleteJob(target.id);
      if (job?.id === target.id) setJob(null);
      await refreshHistory();
      setToast("Deleted");
    } catch (requestError) {
      setError(toUiError(requestError));
    }
  };

  const handleSaveSettings = async (next: Settings) => {
    setSavingSettings(true);
    try {
      const payload = await api.saveSettings(next);
      setSettings(payload.settings);
      setHealth(payload.health);
      setSettingsOpen(false);
      setToast("Settings saved");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleUpdateYtDlp = async () => {
    const result = await api.updateYtDlp();
    setHealth(result.health);
    setToast(result.ok ? "yt-dlp updated" : "yt-dlp update failed");
    return result;
  };

  const openSettings = () => {
    setSettingsOpen(true);
    if (!settings) void refreshSettings();
  };

  const rangeSummary = probe
    ? fullVideo
      ? probe.duration
        ? `Full video · ${formatDuration(probe.duration)}`
        : "Full video"
      : `${formatClock(start)} – ${formatClock(end)} · ${formatDuration(
          Math.max(0, end - start),
        )}`
    : "";

  const qualitySummary =
    kind === "both" && selectedQuality
      ? `${selectedQuality.label} MP4 + ${bitrate} kbps MP3`
      : kind === "mp4" && selectedQuality
        ? `${selectedQuality.label} · ${selectedQuality.codecs.join(" / ")}`
        : `${bitrate} kbps`;

  const kindText =
    kind === "both" ? "MP4 + MP3" : kind === "mp4" ? "MP4" : "MP3";

  const actionLabel = starting
    ? "Starting…"
    : fullVideo
      ? `Download full ${kindText}`
      : `Download ${kindText} clip`;

  const showLanding = !probe && !job;

  return (
    <div className="min-h-screen pb-8">
      <Header
        health={health}
        onOpenSettings={openSettings}
        onHome={handleReset}
      />

      <main className="mx-auto w-full max-w-5xl px-4 pt-10 sm:px-6 sm:pt-14">
        {error ? (
          <div className="mb-5">
            <ErrorBanner error={error} onDismiss={() => setError(null)} />
          </div>
        ) : null}

        {showLanding ? (
          <section className="mx-auto max-w-3xl text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/[0.06] px-3 py-1.5 text-[11px] font-semibold text-orange-200/80">
              <Sparkles className="h-3.5 w-3.5" />
              YouTube → MP4 / MP3 · local-first
            </div>

            <h1 className="text-balance text-4xl font-bold leading-[1.05] tracking-[-0.04em] text-white sm:text-6xl">
              Clip exactly
              <span className="bg-gradient-to-r from-red-400 via-orange-400 to-amber-300 bg-clip-text text-transparent">
                {" "}
                what you need.
              </span>
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-pretty text-sm leading-relaxed text-zinc-400 sm:text-base">
              Paste a YouTube link, choose MP4 or MP3, and download the whole
              video — or just the part from 15:00 to 20:00. Only the selected
              range is fetched.
            </p>

            <div className="panel mt-8 p-4 text-left sm:p-5">
              <UrlForm
                url={url}
                onUrlChange={setUrl}
                onSubmit={() => void handleProbe()}
                loading={probing}
              />
            </div>

            {probing ? <ProbeSkeleton /> : null}

            <div className="mt-8 grid gap-3 text-left sm:grid-cols-3">
              <FeatureCard
                icon={Scissors}
                title="Time-range clipping"
                description="Grab a 5-minute section from a 2-hour video without downloading the rest."
              />
              <FeatureCard
                icon={FileVideo}
                title="MP4 or MP3"
                description="Merge the best video + audio into MP4, or extract clean audio as MP3."
              />
              <FeatureCard
                icon={Shield}
                title="Local & private"
                description="yt-dlp and ffmpeg run on this machine. No account, no cloud, no uploads."
              />
            </div>
          </section>
        ) : (
          <div className="space-y-4">
            <div className="panel p-4 sm:p-5">
              <UrlForm
                url={url}
                onUrlChange={setUrl}
                onSubmit={() => void handleProbe()}
                loading={probing}
              />
            </div>

            {probing ? <ProbeSkeleton /> : null}

            {probe && !probing ? (
              <>
                <div className="panel p-5 sm:p-6">
                  <VideoCard video={probe} />
                </div>

                {probe.isLive ? (
                  <div className="flex items-start gap-2.5 rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] px-4 py-3 text-xs leading-relaxed text-amber-200/75">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    This is an active live stream. Wait until it ends, then paste
                    the replay link.
                  </div>
                ) : null}

                {!job ? (
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                    <div className="panel space-y-6 p-5 sm:p-6">
                      <FormatPicker
                        video={probe}
                        kind={kind}
                        onKindChange={handleKindChange}
                        height={height}
                        onHeightChange={setHeight}
                        bitrate={bitrate}
                        onBitrateChange={setBitrate}
                        estimatedVideoSize={estimates.video}
                        estimatedAudioSize={estimates.audio}
                        selectedDuration={selectedLabel}
                      />

                      <div className="h-px bg-white/5" />

                      <RangeSelector
                        duration={probe.duration}
                        fullVideo={fullVideo}
                        onFullVideoChange={handleFullVideoChange}
                        start={start}
                        end={end}
                        onRangeChange={handleRangeChange}
                        precise={precise}
                        onPreciseChange={setPrecise}
                        chapters={probe.chapters}
                        showPrecise={kind !== "mp3"}
                      />
                    </div>

                    <aside className="panel flex flex-col p-5 sm:p-6">
                      <div className="flex items-center gap-2">
                        <Download className="h-4 w-4 text-orange-400" />
                        <h2 className="text-sm font-semibold text-zinc-200">
                          Download summary
                        </h2>
                      </div>

                      <div className="mt-5 space-y-3">
                        <SummaryRow
                          label="Format"
                          value={
                            kind === "both"
                              ? "MP4 + MP3 · one download"
                              : kind === "mp4"
                                ? "MP4 · video + audio"
                                : "MP3 · audio only"
                          }
                        />
                        <SummaryRow label="Quality" value={qualitySummary} />
                        <SummaryRow label="Range" value={rangeSummary} />
                        <SummaryRow
                          label="Estimated size"
                          value={estimated ? formatBytes(estimated) : "—"}
                        />
                      </div>

                      <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-orange-400/15 bg-orange-400/[0.05] px-3 py-2.5 text-[11px] leading-relaxed text-orange-200/65">
                        <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Only the selected range is downloaded. No full-hour
                        fetch when you pick a 5-minute clip.
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleStart()}
                        disabled={!canStart}
                        className="btn-primary mt-5 h-12 w-full px-5 text-sm"
                        title={
                          probe.isLive
                            ? "Wait until the live stream ends"
                            : rangeInvalid
                              ? "Check the selected range"
                              : undefined
                        }
                      >
                        {starting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        {actionLabel}
                      </button>

                      <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-zinc-600">
                        <Shield className="h-3 w-3" />
                        Processed locally · files never uploaded
                      </div>

                      {kind !== "mp3" &&
                      selectedQuality &&
                      !selectedQuality.h264 ? (
                        <p className="mt-3 text-center text-[10px] leading-relaxed text-amber-300/55">
                          {selectedQuality.codecs.join(" / ")} selected. Use a
                          1080p or lower quality for the widest player support.
                        </p>
                      ) : null}

                      <div className="mt-auto pt-5">
                        <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                          <Clock className="h-3 w-3" />
                          Nothing is queued until you press download.
                        </div>
                      </div>
                    </aside>
                  </div>
                ) : (
                  <JobPanel
                    job={job}
                    onCancel={() => void handleCancel()}
                    onReset={handleReset}
                    onRetry={() => void handleRetry()}
                  />
                )}

                {job && TERMINAL.has(job.status) ? (
                  <div className="flex justify-center pt-1">
                    <button
                      type="button"
                      onClick={handleReset}
                      className="btn-ghost px-3 py-2 text-xs"
                    >
                      Start over with another link
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        )}
      </main>

      <div className="mt-12 sm:mt-16">
        <HistoryList
          jobs={history}
          onRefresh={() => void refreshHistory()}
          onDelete={(target) => void handleDelete(target)}
          refreshing={historyLoading}
        />
      </div>

      <footer className="mx-auto w-full max-w-5xl px-4 pb-6 text-center sm:px-6">
        <p className="mx-auto max-w-2xl text-[10px] leading-relaxed text-zinc-600">
          Local-first · files stay on your machine. Use only for content you own
          or have permission to download. YouTube&apos;s Terms of Service and
          copyright rules apply.
        </p>
      </footer>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        health={health}
        saving={savingSettings}
        onSave={handleSaveSettings}
        onUpdateYtDlp={handleUpdateYtDlp}
      />

      {toast ? (
        <div className="animate-fade-in fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-200 shadow-2xl backdrop-blur">
          <CheckCircle className="h-4 w-4" />
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="panel-soft p-4">
      <div className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-orange-300">
        <Icon className="h-4 w-4" />
      </div>
      <h3 className="text-xs font-semibold text-zinc-200">{title}</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
        {description}
      </p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-3 last:border-0 last:pb-0">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
        {label}
      </span>
      <span className="max-w-[68%] text-right text-xs font-medium leading-relaxed text-zinc-300">
        {value}
      </span>
    </div>
  );
}

function ProbeSkeleton() {
  return (
    <div className="panel mt-4 animate-fade-in p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="skeleton aspect-video w-full rounded-2xl sm:w-[230px]" />
        <div className="flex-1 space-y-3 py-2">
          <div className="skeleton h-3 w-24 rounded-full" />
          <div className="skeleton h-5 w-4/5 rounded-lg" />
          <div className="skeleton h-3 w-1/2 rounded-full" />
          <div className="skeleton h-3 w-2/3 rounded-full" />
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="skeleton h-44 rounded-2xl" />
        <div className="skeleton h-44 rounded-2xl" />
      </div>
    </div>
  );
}
