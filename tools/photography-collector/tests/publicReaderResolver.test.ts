import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeInstagramUrl } from "../src/instagramUrl.js";
import { extractMarkdownImageCandidates, PublicReaderResolver } from "../src/resolvers/publicReaderResolver.js";

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
});
