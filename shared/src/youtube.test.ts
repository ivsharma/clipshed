import { describe, expect, it } from "vitest";
import { canonicalizeYouTubeUrl } from "./youtube";

function expectOk(input: string, videoId = "dQw4w9WgXcQ") {
  const result = canonicalizeYouTubeUrl(input);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  expect(result.videoId).toBe(videoId);
  expect(result.url).toBe(`https://www.youtube.com/watch?v=${videoId}`);
  return result;
}

describe("canonicalizeYouTubeUrl", () => {
  it("accepts common URL shapes", () => {
    expectOk("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expectOk("https://youtu.be/dQw4w9WgXcQ");
    expectOk("https://www.youtube.com/shorts/dQw4w9WgXcQ");
    expectOk("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expectOk("https://m.youtube.com/watch?v=dQw4w9WgXcQ");
    expectOk("https://music.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("accepts links without a protocol", () => {
    expectOk("youtu.be/dQw4w9WgXcQ");
  });

  it("drops playlist parameters from a single video link", () => {
    expectOk("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123");
  });

  it("reads start times", () => {
    expect(expectOk("https://youtu.be/dQw4w9WgXcQ?t=90").startAt).toBe(90);
    expect(expectOk("https://youtu.be/dQw4w9WgXcQ?t=1m30s").startAt).toBe(90);
    expect(expectOk("https://youtu.be/dQw4w9WgXcQ#t=45").startAt).toBe(45);
  });

  it("rejects playlists and non-YouTube links", () => {
    expect(canonicalizeYouTubeUrl("https://www.youtube.com/playlist?list=PL123")).toMatchObject({
      ok: false,
    });
    expect(canonicalizeYouTubeUrl("https://vimeo.com/123")).toMatchObject({
      ok: false,
    });
    expect(canonicalizeYouTubeUrl("javascript:alert(1)")).toMatchObject({
      ok: false,
    });
  });

  it("rejects invalid video IDs", () => {
    expect(canonicalizeYouTubeUrl("https://youtu.be/too-short")).toMatchObject({
      ok: false,
    });
    expect(canonicalizeYouTubeUrl("https://www.youtube.com/watch?v=bad")).toMatchObject({
      ok: false,
    });
  });
});
