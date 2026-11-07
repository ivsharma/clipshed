import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Clock, RotateCcw, Scissors } from "lucide-react";
import {
  formatClock,
  formatDuration,
  parseTime,
  type Chapter,
} from "@clipshed/shared";
import { clamp } from "../lib/format";
import { cn } from "../lib/cn";

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
  const selectedSeconds = fullVideo
    ? safeDuration
    : Math.max(0, end - start);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<DragHandle | null>(null);

  const percent = (seconds: number): number =>
    safeDuration > 0 ? clamp((seconds / safeDuration) * 100, 0, 100) : 0;

  const secondsFromClientX = (clientX: number): number => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    return Math.round(ratio * safeDuration * 10) / 10;
  };

  const applyHandle = (handle: DragHandle, seconds: number): void => {
    if (handle === "start") {
      onRangeChange(clamp(seconds, 0, Math.max(0, end - 1)), end);
    } else {
      onRangeChange(start, clamp(seconds, start + 1, safeDuration));
    }
  };

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (event: globalThis.PointerEvent): void => {
      applyHandle(dragging, secondsFromClientX(event.clientX));
    };
    const handleUp = (): void => setDragging(null);

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  });

  const handleTrackPointerDown = (
    event: PointerEvent<HTMLDivElement>,
  ): void => {
    if (disabled) return;
    event.preventDefault();

    const seconds = secondsFromClientX(event.clientX);
    const handle: DragHandle =
      Math.abs(seconds - start) <= Math.abs(seconds - end) ? "start" : "end";
    setDragging(handle);
    applyHandle(handle, seconds);
  };

  const handleHandleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    handle: DragHandle,
  ): void => {
    const step = event.shiftKey ? 10 : 1;
    const current = handle === "start" ? start : end;
    let next: number | null = null;

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      next = current - step;
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      next = current + step;
    } else if (event.key === "Home") {
      next = handle === "start" ? 0 : start + 1;
    } else if (event.key === "End") {
      next = handle === "start" ? end - 1 : safeDuration;
    }

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

  const resetRange = (): void => {
    onRangeChange(0, safeDuration);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <Scissors className="h-4 w-4 text-orange-400" />
            Time range
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {disabled
              ? "This video doesn't report a duration."
              : fullVideo
                ? "Downloading the entire video."
                : `Selected ${formatDuration(selectedSeconds)} of ${formatDuration(safeDuration)}.`}
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-white/8 bg-black/25 p-1">
          <button
            type="button"
            onClick={() => onFullVideoChange(true)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              fullVideo
                ? "bg-white/10 text-white shadow-sm"
                : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            Full video
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onFullVideoChange(false)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              !fullVideo
                ? "bg-white/10 text-white shadow-sm"
                : "text-zinc-500 hover:text-zinc-300",
              disabled && "cursor-not-allowed opacity-40",
            )}
          >
            Custom range
          </button>
        </div>
      </div>

      {!fullVideo && !disabled ? (
        <div className="animate-fade-in space-y-4">
          <div>
            <div
              ref={timelineRef}
              className="timeline"
              onPointerDown={handleTrackPointerDown}
              role="group"
              aria-label="Time range timeline"
            >
              <div className="timeline-track">
                <div
                  className="timeline-selected"
                  style={{
                    left: `${percent(start)}%`,
                    width: `${Math.max(0, percent(end) - percent(start))}%`,
                  }}
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

            <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-600">
              <span>0:00</span>
              <span>{formatClock(safeDuration)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[1fr_1fr_auto]">
            <TimeField
              label="Start"
              value={start}
              min={0}
              max={Math.max(0, end - 1)}
              onChange={(value) => onRangeChange(value, end)}
            />
            <TimeField
              label="End"
              value={end}
              min={start + 1}
              max={safeDuration}
              onChange={(value) => onRangeChange(start, value)}
            />
            <button
              type="button"
              onClick={resetRange}
              className="btn-secondary col-span-2 h-[58px] gap-1.5 px-4 text-xs sm:col-span-1 sm:self-end"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>

          {chapters.length > 0 ? (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                Jump to a chapter
              </p>
              <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
                {chapters.map((chapter, index) => (
                  <button
                    key={`${chapter.title}-chip-${index}`}
                    type="button"
                    onClick={() => handleChapter(chapter)}
                    className="group flex shrink-0 items-center gap-2 rounded-xl border border-white/7 bg-white/[0.025] px-3 py-2 text-left transition hover:border-orange-400/25 hover:bg-orange-400/[0.05]"
                  >
                    <span className="font-mono text-[10px] text-orange-300/70">
                      {formatClock(chapter.start)}
                    </span>
                    <span className="max-w-[180px] truncate text-[11px] font-medium text-zinc-400 group-hover:text-zinc-200">
                      {chapter.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {showPrecise ? (
            <>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/6 bg-white/[0.025] px-3.5 py-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-zinc-300">
                    Exact cut
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
                    Re-encodes at the cut points for frame accuracy. Slower.
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

              <p className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-zinc-600">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Fast cuts snap to keyframes and may start a few seconds early.
                Exact cut avoids that.
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      {fullVideo && !disabled ? (
        <div className="rounded-xl border border-white/6 bg-white/[0.025] px-3.5 py-3 text-[11px] text-zinc-500">
          Entire video selected · {formatDuration(safeDuration)}. Turn on
          custom range to clip a section.
        </div>
      ) : null}

      {disabled ? (
        <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.05] px-3.5 py-3 text-[11px] text-amber-200/70">
          A time range needs a known video duration. You can still download the
          full file if YouTube provides one.
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
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
        {label}
      </span>
      <div className="relative">
        <Clock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
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
          className="field h-[58px] pl-10 pr-3 font-mono text-sm"
          placeholder="mm:ss"
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      <span
        className={cn(
          "mt-1 block text-[10px]",
          invalid ? "text-red-400" : "text-zinc-600",
        )}
      >
        {invalid ? "Use mm:ss or hh:mm:ss" : "mm:ss or hh:mm:ss"}
      </span>
    </label>
  );
}
