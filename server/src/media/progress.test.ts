import { describe, expect, it } from "vitest";
import type { JobProgress, JobStage } from "@clipshed/shared";
import { ProgressTracker } from "./progress";

function tracker(sectionSeconds: number | null = 60) {
  const progress: JobProgress[] = [];
  const stages: JobStage[] = [];
  const instance = new ProgressTracker(sectionSeconds, (value) => progress.push(value), (stage) => stages.push(stage));
  return { instance, progress, stages, last: () => progress[progress.length - 1] };
}

describe("ProgressTracker", () => {
  it("reads yt-dlp byte progress and percentage", () => {
    const t = tracker();
    t.instance.onStdoutLine("PROGRESS|downloading|500|1000|NA|200|3|137|avc1.640028|none");
    expect(t.last()).toMatchObject({ downloadedBytes: 500, totalBytes: 1000, percent: 50, speed: 200, eta: 3 });
    expect(t.stages).toEqual(["downloading_video"]);
  });

  it("marks audio-only streams as audio", () => {
    const t = tracker();
    t.instance.onStdoutLine("PROGRESS|downloading|10|100|NA|NA|NA|140|none|mp4a.40.2");
    expect(t.stages).toEqual(["downloading_audio"]);
  });

  it("switches to ffmpeg time-based progress for section cuts", () => {
    const t = tracker(60);
    t.instance.onStderrLine("out_time_us=30000000");
    expect(t.last().percent).toBe(50);
    t.instance.onStderrLine("speed=2.0x");
    expect(t.instance.snapshot().eta).toBe(15);
    expect(t.instance.snapshot().detail).toContain("2.0×");
  });

  it("maps postprocess events to stages", () => {
    const t = tracker();
    t.instance.onStdoutLine("POSTPROCESS|started|Merger");
    t.instance.onStdoutLine("POSTPROCESS|started|ExtractAudio");
    expect(t.stages).toEqual(["merging", "converting"]);
  });

  it("stops emitting once frozen", () => {
    const t = tracker();
    t.instance.freeze();
    t.instance.onStdoutLine("PROGRESS|downloading|500|1000|NA|NA|NA|137|avc1|none");
    expect(t.progress).toHaveLength(0);
  });
});
