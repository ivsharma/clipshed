import { describe, expect, it } from "vitest";
import { resolveMediaUrl } from "./platforms";

function expectOk(input: string, platform: string, mediaId: string) {
  const result = resolveMediaUrl(input);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  expect(result.platform).toBe(platform);
  expect(result.mediaId).toBe(mediaId);
  return result;
}

describe("resolveMediaUrl: YouTube", () => {
  const id = "dQw4w9WgXcQ";

  it.each([
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}`,
    `youtu.be/${id}`,
  ])("accepts %s", (input) => {
    const result = expectOk(input, "youtube", id);
    if (result.ok) expect(result.url).toBe(`https://www.youtube.com/watch?v=${id}`);
  });

  it("drops playlist parameters from a single video link", () => {
    expectOk(`https://www.youtube.com/watch?v=${id}&list=PL123`, "youtube", id);
  });

  it("reads start times", () => {
    const start = (input: string) => {
      const result = resolveMediaUrl(input);
      return result.ok ? result.startAt : undefined;
    };
    expect(start(`https://youtu.be/${id}?t=90`)).toBe(90);
    expect(start(`https://youtu.be/${id}?t=1m30s`)).toBe(90);
    expect(start(`https://youtu.be/${id}#t=45`)).toBe(45);
  });

  it("rejects playlists and malformed IDs", () => {
    expect(resolveMediaUrl("https://www.youtube.com/playlist?list=PL123").ok).toBe(false);
    expect(resolveMediaUrl("https://youtu.be/too-short").ok).toBe(false);
    expect(resolveMediaUrl("https://www.youtube.com/watch?v=bad").ok).toBe(false);
  });
});

describe("resolveMediaUrl: Facebook", () => {
  it("accepts watch links", () => {
    expectOk("https://www.facebook.com/watch/?v=1234567890", "facebook", "1234567890");
  });

  it("accepts reels and page videos", () => {
    const reel = expectOk("https://www.facebook.com/reel/9876543210", "facebook", "9876543210");
    if (reel.ok) expect(reel.url).toBe("https://www.facebook.com/reel/9876543210");

    expectOk("https://www.facebook.com/somepage/videos/5556667778/", "facebook", "5556667778");
    expectOk("https://m.facebook.com/videos/5556667778", "facebook", "5556667778");
  });

  it("accepts fb.watch short links", () => {
    expectOk("https://fb.watch/AbC123xyz/", "facebook", "AbC123xyz");
  });

  it("rejects profile pages", () => {
    expect(resolveMediaUrl("https://www.facebook.com/somepage").ok).toBe(false);
  });
});

describe("resolveMediaUrl: Instagram", () => {
  it("accepts posts, reels, and IGTV", () => {
    expectOk("https://www.instagram.com/p/CxYz12aBcDe/", "instagram", "CxYz12aBcDe");
    expectOk("https://www.instagram.com/reel/CxYz12aBcDe/", "instagram", "CxYz12aBcDe");
    expectOk("https://instagram.com/reels/CxYz12aBcDe", "instagram", "CxYz12aBcDe");
    expectOk("https://www.instagram.com/tv/CxYz12aBcDe/", "instagram", "CxYz12aBcDe");
  });

  it("normalises /reels/ to /reel/", () => {
    const result = resolveMediaUrl("https://www.instagram.com/reels/CxYz12aBcDe/");
    if (result.ok) expect(result.url).toBe("https://www.instagram.com/reel/CxYz12aBcDe/");
  });

  it("rejects stories and profiles", () => {
    expect(resolveMediaUrl("https://www.instagram.com/stories/someone/123/").ok).toBe(false);
    expect(resolveMediaUrl("https://www.instagram.com/someone/").ok).toBe(false);
  });
});

describe("resolveMediaUrl: general", () => {
  it("rejects unknown hosts and unsafe input", () => {
    expect(resolveMediaUrl("https://vimeo.com/123").ok).toBe(false);
    expect(resolveMediaUrl("javascript:alert(1)").ok).toBe(false);
    expect(resolveMediaUrl("https://user:pass@youtu.be/dQw4w9WgXcQ").ok).toBe(false);
    expect(resolveMediaUrl("   ").ok).toBe(false);
  });
});
