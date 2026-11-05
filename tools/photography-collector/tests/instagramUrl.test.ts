import { describe, expect, it } from "vitest";
import { normalizeInstagramUrl } from "../src/instagramUrl.js";

const knownUrl = "https://www.instagram.com/p/TEST_CODE_1/?utm_source=ig_web_copy_link&igsh=example";

describe("normalizeInstagramUrl", () => {
  it("normalizes a tracked Instagram post URL", () => {
    expect(normalizeInstagramUrl(knownUrl)).toEqual({
      inputUrl: knownUrl,
      canonicalUrl: "https://www.instagram.com/p/TEST_CODE_1/",
      shortcode: "TEST_CODE_1",
      routeType: "post"
    });
  });

  it("normalizes reel URLs", () => {
    expect(normalizeInstagramUrl("https://instagram.com/reel/ABC_123-def/").canonicalUrl).toBe(
      "https://www.instagram.com/reel/ABC_123-def/"
    );
  });

  it("rejects non-Instagram URLs", () => {
    expect(() => normalizeInstagramUrl("https://example.com/p/TEST_CODE_1/")).toThrow(/Unsupported Instagram host/);
  });

  it("rejects non-HTTPS URLs", () => {
    expect(() => normalizeInstagramUrl("http://www.instagram.com/p/TEST_CODE_1/")).toThrow(/HTTPS/);
  });
});
