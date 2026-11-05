import { describe, expect, it } from "vitest";
import { normalizeInstagramUrl } from "../src/instagramUrl.js";

const knownUrl = "https://www.instagram.com/p/TEST_CODE_1/?utm_source=ig_web_copy_link&igsh=example";

describe("normalizeInstagramUrl", () => {
  it.each(["constructor", "valueOf", "toString"])("reads %s as the username it can be, not as a route", (name) => {
    const expected = name.toLowerCase();
    expect(normalizeInstagramUrl(`https://www.instagram.com/${name}/`)).toMatchObject({ routeType: "profile", shortcode: expected });
  });

  it("doesn't take an inherited name for a route in a longer path", () => {
    expect(normalizeInstagramUrl("https://www.instagram.com/constructor/abcde/")).toMatchObject({ routeType: "profile", shortcode: "constructor" });
  });

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

  it.each([
    ["https://www.instagram.com/someuser/p/ABC_123-def/", "https://www.instagram.com/p/ABC_123-def/", "post"],
    ["https://www.instagram.com/someuser/reel/ABC_123-def/?igsh=x", "https://www.instagram.com/reel/ABC_123-def/", "reel"],
    ["https://www.instagram.com/reels/ABC_123-def/", "https://www.instagram.com/reel/ABC_123-def/", "reel"],
    ["https://www.instagram.com/tv/ABC_123-def/", "https://www.instagram.com/p/ABC_123-def/", "post"],
    ["https://m.instagram.com/p/ABC_123-def/", "https://www.instagram.com/p/ABC_123-def/", "post"],
    ["https://instagr.am/p/ABC_123-def/", "https://www.instagram.com/p/ABC_123-def/", "post"]
  ])("normalizes %s", (url, canonicalUrl, routeType) => {
    expect(normalizeInstagramUrl(url)).toMatchObject({ canonicalUrl, routeType });
  });

  it.each([
    ["https://www.instagram.com/nasa/", "nasa"],
    ["https://www.instagram.com/nasa", "nasa"],
    ["https://instagram.com/NASA/?hl=en", "nasa"],
    ["https://m.instagram.com/nasa/", "nasa"],
    ["https://instagr.am/nasa", "nasa"],
    ["https://www.instagram.com/nasa/tagged/", "nasa"],
    ["https://www.instagram.com/nasa/reels/", "nasa"],
    ["https://www.instagram.com/_u/nasa/", "nasa"],
    ["https://www.instagram.com/some.user_name/", "some.user_name"]
  ])("reads %s as the profile of %s", (url, username) => {
    expect(normalizeInstagramUrl(url)).toMatchObject({
      canonicalUrl: `https://www.instagram.com/${username}/`,
      shortcode: username,
      routeType: "profile"
    });
  });

  it.each([
    "https://www.instagram.com/",
    "https://www.instagram.com/explore/",
    "https://www.instagram.com/explore/tags/space/",
    "https://www.instagram.com/stories/nasa/123/",
    "https://www.instagram.com/accounts/login/",
    "https://www.instagram.com/reels/",
    "https://www.instagram.com/direct/inbox/",
    "https://www.instagram.com/not%20a%20user/"
  ])("refuses %s, which isn't an account", (url) => {
    expect(() => normalizeInstagramUrl(url)).toThrow(/post, Reel and profile/);
  });

  it("rejects a post route with no code rather than reading it as a profile", () => {
    expect(() => normalizeInstagramUrl("https://www.instagram.com/p/")).toThrow(/shortcode/);
    expect(() => normalizeInstagramUrl("https://www.instagram.com/p/!/")).toThrow(/shortcode/);
  });

  it("rejects non-Instagram URLs", () => {
    expect(() => normalizeInstagramUrl("https://example.com/p/TEST_CODE_1/")).toThrow(/Unsupported Instagram host/);
  });

  it("rejects non-HTTPS URLs", () => {
    expect(() => normalizeInstagramUrl("http://www.instagram.com/p/TEST_CODE_1/")).toThrow(/HTTPS/);
  });
});
