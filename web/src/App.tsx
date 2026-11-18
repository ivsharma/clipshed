import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle } from "lucide-react";
import {
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
import { Landing } from "./components/Landing";
import { RangeSelector } from "./components/RangeSelector";
import { SettingsDialog } from "./components/SettingsDialog";
import { SummaryPanel } from "./components/SummaryPanel";
import { UrlForm } from "./components/UrlForm";
import { ProbeSkeleton, VideoCard } from "./components/VideoCard";
import { useJobEvents } from "./hooks/useJobEvents";
import { useTheme } from "./hooks/useTheme";
import { ApiError, api } from "./lib/api";
import { defaultHeight, estimateSizes, findQuality, selectedDurationLabel, selectionProblem, type Selection } from "./lib/selection";

const TERMINAL = new Set<Job["status"]>(["completed", "failed", "cancelled"]);
const DEFAULT_BITRATE = 192;
const DEFAULT_CLIP_SECONDS = 300;

function toUiError(error: unknown): UiError {
  if (error instanceof ApiError) return { message: error.message, code: error.code, details: error.details };
  if (error instanceof Error) return { message: error.message };
  return { message: "Something went wrong." };
}

export default function App() {
  const [url, setUrl] = useState("");
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);

  const [selection, setSelection] = useState<Selection>({
    kind: "mp4",
    height: null,
    bitrate: DEFAULT_BITRATE,
    fullVideo: true,
    start: 0,
    end: 0,
  });
  const [precise, setPrecise] = useState(false);
  const patch = (changes: Partial<Selection>) => setSelection((current) => ({ ...current, ...changes }));

  const [job, setJob] = useState<Job | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<UiError | null>(null);

  const [history, setHistory] = useState<Job[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const { theme, setTheme } = useTheme();
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
      setHistory((await api.listJobs()).jobs);
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
      if (TERMINAL.has(event.job.status)) void refreshHistory(true);
    },
    [refreshHistory],
  );
  useJobEvents(job?.id ?? null, handleJobEvent, Boolean(job && !TERMINAL.has(job.status)));

  const cancelActiveJob = () => {
    if (job && !TERMINAL.has(job.status)) void api.cancelJob(job.id).catch(() => undefined);
  };

  const estimates = useMemo(() => (probe ? estimateSizes(probe, selection) : null), [probe, selection]);
  const problem = probe ? selectionProblem(probe, selection) : "Paste a link first.";
  const selectedQuality = probe ? findQuality(probe, selection.height) : null;

  const handleProbe = async () => {
    if (!url.trim() || probing) return;
    cancelActiveJob();
    setProbing(true);
    setError(null);
    setProbe(null);
    setJob(null);

    try {
      const video = await api.probe(url.trim());
      setProbe(video);
      setPrecise(false);

      const clipStart = video.suggestedStart;
      const clipped = Boolean(video.duration && clipStart !== null && clipStart > 0 && clipStart < video.duration);
      setSelection({
        kind: video.qualities.length > 0 ? "mp4" : "mp3",
        height: defaultHeight(video),
        bitrate: DEFAULT_BITRATE,
        fullVideo: !clipped,
        start: clipped ? (clipStart ?? 0) : 0,
        end: clipped ? Math.min(video.duration ?? 0, (clipStart ?? 0) + DEFAULT_CLIP_SECONDS) : (video.duration ?? 0),
      });
    } catch (requestError) {
      setError(toUiError(requestError));
    } finally {
      setProbing(false);
    }
  };

  const handleKindChange = (kind: JobKind) => {
    if (kind === "mp3") setPrecise(false);
    patch({ kind, height: selection.height ?? (probe ? defaultHeight(probe) : null) });
  };

  const handleFullVideoChange = (fullVideo: boolean) => {
    if (!fullVideo && probe?.duration && (selection.end <= selection.start || selection.end > probe.duration)) {
      patch({ fullVideo, start: 0, end: probe.duration });
    } else {
      patch({ fullVideo });
    }
  };

  const handleStart = async () => {
    if (!probe || problem) {
      if (problem) setError({ message: problem });
      return;
    }

    setStarting(true);
    setError(null);
    try {
      const created = await api.createJob({
        url: probe.url,
        kind: selection.kind,
        height: selection.kind !== "mp3" ? (selection.height ?? undefined) : undefined,
        bitrate: selection.kind !== "mp4" ? selection.bitrate : undefined,
        range: selection.fullVideo ? null : { start: selection.start, end: selection.end },
        precise,
      });
      setJob(created);
      void refreshHistory(true);
      window.requestAnimationFrame(() => {
        document.getElementById("job-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      setJob(await api.cancelJob(job.id));
    } catch (requestError) {
      setError(toUiError(requestError));
    }
  };

  const handleReset = () => {
    cancelActiveJob();
    setProbe(null);
    setJob(null);
    setError(null);
    setUrl("");
    setPrecise(false);
    setSelection((current) => ({ ...current, fullVideo: true, start: 0, end: 0 }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleRetry = async () => {
    setJob(null);
    await handleStart();
  };

  const handleDelete = async (target: Job) => {
    if (!window.confirm(`Delete "${target.title}" and its downloaded files?`)) return;
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

  const handleImportCookies = async (filename: string, content: string) => {
    const payload = await api.importCookies(filename, content);
    setSettings(payload.settings);
    setHealth(payload.health);
    setToast("Cookies imported");
  };

  const handleCheckUpdates = () => api.checkForUpdates();

  const openSettings = () => {
    setSettingsOpen(true);
    if (!settings) void refreshSettings();
  };

  const rangeLabel = !probe
    ? ""
    : selection.fullVideo
      ? probe.duration
        ? `Full video · ${formatDuration(probe.duration)}`
        : "Full video"
      : `${formatClock(selection.start)} – ${formatClock(selection.end)} · ${formatDuration(Math.max(0, selection.end - selection.start))}`;

  const kindText = selection.kind === "both" ? "MP4 + MP3" : selection.kind === "mp4" ? "MP4" : "MP3";
  const actionLabel = starting ? "Starting…" : `Download ${selection.fullVideo ? "full " : ""}${kindText}${selection.fullVideo ? "" : " clip"}`;

  const showLanding = !probe && !job;

  return (
    <div className="min-h-screen pb-8">
      <Header health={health} onOpenSettings={openSettings} onHome={handleReset} />

      <main className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12">
        {error ? (
          <div className="mb-5">
            <ErrorBanner error={error} onDismiss={() => setError(null)} />
          </div>
        ) : null}

        {showLanding ? (
          <Landing url={url} onUrlChange={setUrl} onSubmit={() => void handleProbe()} loading={probing} />
        ) : (
          <div className="space-y-4">
            <div className="panel p-4 sm:p-5">
              <UrlForm url={url} onUrlChange={setUrl} onSubmit={() => void handleProbe()} loading={probing} />
            </div>

            {probing ? <ProbeSkeleton /> : null}

            {probe && !probing ? (
              <>
                <div className="panel p-5 sm:p-6">
                  <VideoCard video={probe} />
                </div>

                {probe.isLive ? (
                  <div className="flex items-start gap-2.5 border border-[var(--line-strong)] border-l-4 border-l-[var(--amber)] bg-[var(--paper-raised)] px-4 py-3 text-xs leading-relaxed text-[var(--ink-soft)]">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--amber)]" />
                    This is an active live stream. Wait until it ends, then paste the replay link.
                  </div>
                ) : null}

                {job ? (
                  <JobPanel job={job} onCancel={() => void handleCancel()} onReset={handleReset} onRetry={() => void handleRetry()} />
                ) : (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                    <div className="panel space-y-6 p-5 sm:p-6">
                      <FormatPicker
                        video={probe}
                        kind={selection.kind}
                        onKindChange={handleKindChange}
                        height={selection.height}
                        onHeightChange={(height) => patch({ height })}
                        bitrate={selection.bitrate}
                        onBitrateChange={(bitrate) => patch({ bitrate })}
                        estimatedVideoSize={estimates?.video ?? null}
                        estimatedAudioSize={estimates?.audio ?? null}
                        selectedDuration={selectedDurationLabel(probe, selection)}
                      />

                      <div className="h-px bg-[var(--line)]" />

                      <RangeSelector
                        duration={probe.duration}
                        fullVideo={selection.fullVideo}
                        onFullVideoChange={handleFullVideoChange}
                        start={selection.start}
                        end={selection.end}
                        onRangeChange={(start, end) => patch({ start, end })}
                        precise={precise}
                        onPreciseChange={setPrecise}
                        chapters={probe.chapters}
                        showPrecise={selection.kind !== "mp3"}
                      />
                    </div>

                    <SummaryPanel
                      kind={selection.kind}
                      quality={selectedQuality}
                      bitrate={selection.bitrate}
                      rangeLabel={rangeLabel}
                      estimatedBytes={estimates?.total ?? null}
                      actionLabel={actionLabel}
                      canStart={!problem && !starting}
                      starting={starting}
                      blockedReason={problem}
                      onStart={() => void handleStart()}
                    />
                  </div>
                )}

                {job && TERMINAL.has(job.status) ? (
                  <div className="flex justify-center pt-1">
                    <button type="button" onClick={handleReset} className="btn-ghost px-3 py-2 text-xs">
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

      <footer className="mx-auto w-full max-w-6xl px-4 pb-6 sm:px-6">
        <div className="flex flex-col gap-2 border-t border-[var(--line-strong)] pt-4 font-mono text-[10px] leading-relaxed tracking-[0.05em] text-[var(--ink-mute)] sm:flex-row sm:items-center sm:justify-between">
          <span>CLIPSHED / LOCAL-FIRST / NO UPLOADS</span>
          <span className="max-w-xl sm:text-right">
            DOWNLOAD ONLY CONTENT YOU HAVE THE RIGHT TO USE. RESPECT EACH SITE&apos;S TERMS OF SERVICE AND COPYRIGHT LAW.
          </span>
        </div>
      </footer>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        health={health}
        saving={savingSettings}
        theme={theme}
        onThemeChange={setTheme}
        onSave={handleSaveSettings}
        onImportCookies={handleImportCookies}
        onUpdateYtDlp={handleUpdateYtDlp}
        onCheckUpdates={handleCheckUpdates}
      />

      {toast ? (
        <div className="animate-fade-in fixed bottom-5 right-5 z-[60] flex items-center gap-2 border border-[var(--ink)] bg-[var(--ink)] px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--paper-raised)] shadow-[4px_4px_0_var(--red)]">
          <CheckCircle className="h-4 w-4 text-[var(--red)]" />
          {toast}
        </div>
      ) : null}
    </div>
  );
}
