import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Clock, RotateCcw } from "lucide-react";
import { formatClock, formatDuration, parseTime, type Chapter } from "@clipshed/shared";
import { clamp } from "../lib/format";

interface RangeSelectorProps {
  duration: number | null;
  fullVideo: boolean;
  onFullVideoChange: (value: boolean) => void;
  start: number;
  end: number;
  onRangeChange: (start: number, end: number) => void;
  precise: boolean;
  onPreciseChange: (value: boolean) => void;
  chapters: Chapter[];
  showPrecise: boolean;
}

type DragHandle = "start" | "end";

export function RangeSelector({
  duration,
  fullVideo,
  onFullVideoChange,
  start,
  end,
  onRangeChange,
  precise,
  onPreciseChange,
  chapters,
  showPrecise,
}: RangeSelectorProps) {
  const safeDuration = duration ?? 0;
  const disabled = !safeDuration || safeDuration <= 0;
  const selectedSeconds = fullVideo ? safeDuration : Math.max(0, end - start);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<DragHandle | null>(null);

  const percent = (seconds: number): number =>
    safeDuration > 0 ? clamp((seconds / safeDuration) * 100, 0, 100) : 0;

  const secondsFromClientX = (clientX: number): number => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return Math.round(clamp((clientX - rect.left) / rect.width, 0, 1) * safeDuration * 10) / 10;
  };

  const applyHandle = (handle: DragHandle, seconds: number): void => {
    if (handle === "start") onRangeChange(clamp(seconds, 0, Math.max(0, end - 1)), end);
    else onRangeChange(start, clamp(seconds, start + 1, safeDuration));
  };

  useEffect(() => {
    if (!dragging) return;

    const move = (event: globalThis.PointerEvent): void => applyHandle(dragging, secondsFromClientX(event.clientX));
    const up = (): void => setDragging(null);

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  });

  const handleTrackPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (disabled) return;
    event.preventDefault();
    const seconds = secondsFromClientX(event.clientX);
    const handle: DragHandle = Math.abs(seconds - start) <= Math.abs(seconds - end) ? "start" : "end";
    setDragging(handle);
    applyHandle(handle, seconds);
  };

  const handleHandleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, handle: DragHandle): void => {
    const step = event.shiftKey ? 10 : 1;
    const current = handle === "start" ? start : end;
    let next: number | null = null;

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = current - step;
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") next = current + step;
    else if (event.key === "Home") next = handle === "start" ? 0 : start + 1;
    else if (event.key === "End") next = handle === "start" ? end - 1 : safeDuration;

    if (next !== null) {
      event.preventDefault();
      applyHandle(handle, next);
    }
  };

  const handleChapter = (chapter: Chapter): void => {
    onFullVideoChange(false);
    onRangeChange(
      clamp(chapter.start, 0, Math.max(0, safeDuration - 1)),
      clamp(chapter.end, chapter.start + 1, safeDuration),
    );
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="mono-label">02 / Range</span>
        <span className="font-mono text-[11px] text-[var(--ink-mute)]">
          {disabled ? "DURATION UNKNOWN" : `${formatDuration(selectedSeconds)} SELECTED`}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="display text-2xl text-[var(--ink)]">Time range</h3>
          <p className="mt-1 text-[13px] text-[var(--ink-mute)]">
            {disabled
              ? "This video doesn't report a duration."
              : fullVideo
                ? "The entire video will be downloaded."
                : `From ${formatClock(start)} to ${formatClock(end)}.`}
          </p>
        </div>

        <div className="inline-flex border border-[var(--ink)]">
          <button
            type="button"
            onClick={() => onFullVideoChange(true)}
            className={`px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] transition ${
              fullVideo ? "bg-[var(--ink)] text-[var(--paper-raised)]" : "text-[var(--ink-mute)] hover:text-[var(--ink)]"
            }`}
          >
            Full
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onFullVideoChange(false)}
            className={`border-l border-[var(--ink)] px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] transition ${
              !fullVideo ? "bg-[var(--ink)] text-[var(--paper-raised)]" : "text-[var(--ink-mute)] hover:text-[var(--ink)]"
            } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
          >
            Custom
          </button>
        </div>
      </div>

      {!fullVideo && !disabled ? (
        <div className="animate-fade-in space-y-4">
          <div>
            <div ref={timelineRef} className="timeline" onPointerDown={handleTrackPointerDown} role="group" aria-label="Time range timeline">
              <div className="timeline-track">
                <div
                  className="timeline-selected"
                  style={{ left: `${percent(start)}%`, width: `${Math.max(0, percent(end) - percent(start))}%` }}
                />
              </div>

              {chapters.map((chapter, index) => (
                <button
                  key={`${chapter.title}-${index}`}
                  type="button"
                  className="timeline-chapter"
                  style={{ left: `${percent(chapter.start)}%` }}
                  title={`${chapter.title} · ${formatClock(chapter.start)} – ${formatClock(chapter.end)}`}
                  aria-label={`Use chapter: ${chapter.title}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => handleChapter(chapter)}
                />
              ))}

              <button
                type="button"
                role="slider"
                className="timeline-handle"
                style={{ left: `${percent(start)}%` }}
                aria-label="Range start"
                aria-valuemin={0}
                aria-valuemax={Math.max(0, end - 1)}
                aria-valuenow={start}
                aria-valuetext={formatClock(start)}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  setDragging("start");
                }}
                onKeyDown={(event) => handleHandleKeyDown(event, "start")}
              />
              <button
                type="button"
                role="slider"
                className="timeline-handle"
                style={{ left: `${percent(end)}%` }}
                aria-label="Range end"
                aria-valuemin={start + 1}
                aria-valuemax={safeDuration}
                aria-valuenow={end}
                aria-valuetext={formatClock(end)}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  setDragging("end");
                }}
                onKeyDown={(event) => handleHandleKeyDown(event, "end")}
              />
            </div>

            <div className="mt-1 flex justify-between font-mono text-[10px] text-[var(--ink-mute)]">
              <span>0:00</span>
              <span>{formatClock(safeDuration)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <TimeField label="Start" value={start} min={0} max={Math.max(0, end - 1)} onChange={(value) => onRangeChange(value, end)} />
            <TimeField label="End" value={end} min={start + 1} max={safeDuration} onChange={(value) => onRangeChange(start, value)} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] tracking-[0.05em] text-[var(--ink-mute)]">
              SET BOTH TIMES OR DRAG THE HANDLES.
            </span>
            <button
              type="button"
              onClick={() => onRangeChange(0, safeDuration)}
              className="btn-ghost h-7 shrink-0 gap-1.5 px-2 font-mono text-[11px] uppercase tracking-[0.06em]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset range
            </button>
          </div>

          {chapters.length > 0 ? (
            <div>
              <p className="mono-label mb-2">Chapters</p>
              <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
                {chapters.map((chapter, index) => (
                  <button
                    key={`${chapter.title}-chip-${index}`}
                    type="button"
                    onClick={() => handleChapter(chapter)}
                    className="flex shrink-0 items-center gap-2 border border-[var(--line-strong)] px-2.5 py-1.5 text-left transition hover:border-[var(--red)] hover:bg-[var(--red-hover)]"
                  >
                    <span className="font-mono text-[10px] text-[var(--red)]">{formatClock(chapter.start)}</span>
                    <span className="max-w-[180px] truncate text-[12px] text-[var(--ink-soft)]">{chapter.title}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {showPrecise ? (
            <div className="flex items-center justify-between gap-4 border border-[var(--line-strong)] px-3 py-3">
              <div>
                <p className="text-[13px] font-semibold text-[var(--ink)]">Exact cut</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--ink-mute)]">
                  Re-encodes at the cut points. Slower, but frame-accurate.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={precise}
                aria-label="Exact cut"
                data-on={precise}
                className="switch"
                onClick={() => onPreciseChange(!precise)}
              >
                <span className="switch-knob" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {fullVideo && !disabled ? (
        <div className="border-l-2 border-l-[var(--line-strong)] bg-[var(--paper)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--ink-mute)]">
          Entire video selected. Switch to Custom to clip a section.
        </div>
      ) : null}

      {disabled ? (
        <div className="border-l-2 border-l-[var(--amber)] bg-[var(--paper)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--ink-soft)]">
          A range needs a known duration. You can still download the full file if one is available.
        </div>
      ) : null}
    </div>
  );
}

interface TimeFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

function TimeField({ label, value, min, max, onChange }: TimeFieldProps) {
  const [text, setText] = useState(formatClock(value));
  const [focused, setFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatClock(value));
  }, [value, focused]);

  const commit = (): void => {
    const parsed = parseTime(text);
    if (parsed === null || parsed < min || parsed > max) {
      setInvalid(true);
      setText(formatClock(value));
      window.setTimeout(() => setInvalid(false), 1200);
      return;
    }
    setInvalid(false);
    onChange(parsed);
    setText(formatClock(parsed));
  };

  return (
    <label className="block">
      <span className="mono-label mb-1.5 block">{label}</span>
      <div className="relative">
        <Clock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-mute)]" />
        <input
          value={text}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              setText(formatClock(value));
              setInvalid(false);
              event.currentTarget.blur();
            }
          }}
          aria-invalid={invalid}
          className="field h-[54px] pl-9 pr-3 font-mono text-[14px]"
          placeholder="mm:ss"
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      <span className={`mt-1 block font-mono text-[10px] ${invalid ? "text-[var(--red)]" : "text-[var(--ink-mute)]"}`}>
        {invalid ? "USE MM:SS OR HH:MM:SS" : "MM:SS / HH:MM:SS"}
      </span>
    </label>
  );
}
