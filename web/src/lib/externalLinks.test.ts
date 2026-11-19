import { describe, expect, it } from "vitest";
import { externalHttpUrl } from "./externalLinks";

const APP_ORIGIN = "http://127.0.0.1:43123";

describe("externalHttpUrl", () => {
  it("accepts http and https links outside the app", () => {
    expect(externalHttpUrl("https://github.com/ivsharma/clipshed", APP_ORIGIN, APP_ORIGIN)).toBe(
      "https://github.com/ivsharma/clipshed",
    );
    expect(externalHttpUrl("http://example.com/release", APP_ORIGIN, APP_ORIGIN)).toBe(
      "http://example.com/release",
    );
  });

  it("leaves app links and non-http schemes alone", () => {
    expect(externalHttpUrl(`${APP_ORIGIN}/api/jobs`, APP_ORIGIN, APP_ORIGIN)).toBeNull();
    expect(externalHttpUrl("/api/jobs", APP_ORIGIN, APP_ORIGIN)).toBeNull();
    expect(externalHttpUrl("mailto:hello@example.com", APP_ORIGIN, APP_ORIGIN)).toBeNull();
    expect(externalHttpUrl("javascript:alert(1)", APP_ORIGIN, APP_ORIGIN)).toBeNull();
  });

  it("rejects malformed URLs", () => {
    expect(externalHttpUrl("http://[", APP_ORIGIN, APP_ORIGIN)).toBeNull();
  });
});
