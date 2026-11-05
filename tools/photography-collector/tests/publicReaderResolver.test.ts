import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeInstagramUrl } from "../src/instagramUrl.js";
import { buildReaderUrl, extractMarkdownImageCandidates, PublicReaderResolver } from "../src/resolvers/publicReaderResolver.js";

describe("PublicReaderResolver", () => {
  it("extracts markdown image candidates", async () => {
    const fixture = await readFile(resolve("tests/fixtures/instagram-reader-sample.md"), "utf8");
    const candidates = extractMarkdownImageCandidates(fixture);
    expect(candidates).toHaveLength(5);
    expect(candidates[0]?.altText).toContain("profile picture");
  });

  it("classifies fixture candidates without live network", async () => {
    const fixture = await readFile(resolve("tests/fixtures/instagram-reader-sample.md"), "utf8");
    const resolver = new PublicReaderResolver(async () => fixture);
    const candidates = await resolver.resolve(normalizeInstagramUrl("https://www.instagram.com/p/TEST_CODE_1/"));

    expect(candidates.filter((candidate) => candidate.mediaKind === "profile_picture")).toHaveLength(1);
    expect(candidates.filter((candidate) => candidate.mediaKind === "carousel_item")).toHaveLength(2);
    expect(candidates.filter((candidate) => candidate.mediaKind === "related_post_thumbnail")).toHaveLength(2);
  });

  it("builds the reader's documented URL form, with one scheme", () => {
    const input = normalizeInstagramUrl("https://www.instagram.com/p/TEST_CODE_1/?igsh=abc");
    expect(buildReaderUrl(input)).toBe("https://r.jina.ai/https://www.instagram.com/p/TEST_CODE_1/");
  });

  it("reads a profile from its public embed page, because the profile page asks for a login", () => {
    expect(buildReaderUrl(normalizeInstagramUrl("https://www.instagram.com/nasa/?hl=en"))).toBe(
      "https://r.jina.ai/https://www.instagram.com/nasa/embed/"
    );
  });

  it("reports a login wall instead of treating the login page's art as content", async () => {
    const fixture = await readFile(resolve("tests/fixtures/instagram-reader-login-wall.md"), "utf8");
    const resolver = new PublicReaderResolver(async () => fixture);
    await expect(resolver.resolve(normalizeInstagramUrl("https://www.instagram.com/p/TEST_CODE_3/"))).rejects.toMatchObject({
      code: "login_required"
    });
  });

  it("sorts a live-shaped post page: the post, then neighbours under the boundary", async () => {
    const fixture = await readFile(resolve("tests/fixtures/instagram-reader-live-post.md"), "utf8");
    const resolver = new PublicReaderResolver(async () => fixture);
    const candidates = await resolver.resolve(normalizeInstagramUrl("https://www.instagram.com/p/TEST_CODE_3/"));
    expect(candidates.filter((candidate) => candidate.mediaKind === "carousel_item")).toHaveLength(1);
    expect(candidates.filter((candidate) => candidate.basis === "listed_under_more_posts")).toHaveLength(2);
  });

  it("lists a profile's recent posts, whatever their captions say", async () => {
    const fixture = await readFile(resolve("tests/fixtures/instagram-reader-profile-embed.md"), "utf8");
    const resolver = new PublicReaderResolver(async () => fixture);
    const candidates = await resolver.resolve(normalizeInstagramUrl("https://www.instagram.com/sampleagency/"));
    expect(candidates.map((candidate) => [candidate.mediaKind, candidate.basis])).toEqual([
      ["profile_picture", "profile_picture"],
      ["post_image", "shown_on_profile"],
      ["post_image", "shown_on_profile"]
    ]);
    expect(new Set(candidates.map((candidate) => candidate.shortcode))).toEqual(new Set(["sampleagency"]));
  });

  it("marks only images after the More posts line, and ignores a caption quoting those words", async () => {
    const fixture = await readFile(resolve("tests/fixtures/instagram-reader-same-day.md"), "utf8");
    const raw = extractMarkdownImageCandidates(fixture);
    expect(raw.map((candidate) => candidate.contextText)).toEqual([
      undefined,
      undefined,
      undefined,
      "more posts",
      "more posts"
    ]);
  });

  it("isn't moved by a caption in the page title", () => {
    const markdown = [
      'Title: Example on Instagram: "More posts from this trip coming soon"',
      "![Image 2: Photo by Example on June 24, 2024.](https://scontent.cdninstagram.com/a.jpg)"
    ].join("\n");
    expect(extractMarkdownImageCandidates(markdown)[0]?.contextText).toBeUndefined();
  });

  it.each(["More posts from sample", "## More posts from sample", "[More posts from sample](https://www.instagram.com/sample/)"])(
    "recognizes the boundary written as %s",
    (line) => {
      const markdown = `${line}\n![Image 6: Photo by Example.](https://scontent.cdninstagram.com/a.jpg)`;
      expect(extractMarkdownImageCandidates(markdown)[0]?.contextText).toBe("more posts");
    }
  );

  it("keeps an image whose alt text holds balanced brackets", () => {
    const markdown = "![Photo by Example. Text that says [1/3] Paris](https://scontent.cdninstagram.com/a.jpg)";
    expect(extractMarkdownImageCandidates(markdown)).toHaveLength(1);
  });

  it.each([
    ["![ repeated", "![".repeat(1024 * 1024)],
    ["unclosed image links", "![](https://a".repeat(160_000)],
    ["an unclosed alt", `![${"a".repeat(2 * 1024 * 1024)}`],
    ["nested brackets", `![${"[a]".repeat(700_000)}`]
  ])("reads 2 MB of %s in bounded time", (_name, markdown) => {
    const started = performance.now();
    expect(extractMarkdownImageCandidates(markdown)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("does not let same-day neighbours below the boundary into the post", async () => {
    const fixture = await readFile(resolve("tests/fixtures/instagram-reader-same-day.md"), "utf8");
    const resolver = new PublicReaderResolver(async () => fixture);
    const candidates = await resolver.resolve(normalizeInstagramUrl("https://www.instagram.com/p/TEST_CODE_2/"));

    expect(candidates.map((candidate) => [candidate.mediaKind, candidate.basis])).toEqual([
      ["profile_picture", "profile_picture"],
      ["carousel_item", "first_dated_photo"],
      ["carousel_item", "same_date_as_first"],
      ["related_post_thumbnail", "listed_under_more_posts"],
      ["related_post_thumbnail", "listed_under_more_posts"]
    ]);
  });
});
