import { describe, expect, it } from "vitest";
import { normalizeInstagramUrl } from "../src/instagramUrl.js";
import { classifyCandidates } from "../src/resolvers/candidateClassifier.js";
import type { RawMediaCandidate } from "../src/resolvers/resolverTypes.js";

const input = normalizeInstagramUrl("https://www.instagram.com/p/TEST_CODE_1/");

const raw: readonly RawMediaCandidate[] = [
  {
    sourceName: "public_reader",
    remoteUrl: "https://scontent-sea1-1.cdninstagram.com/profile.jpg",
    altText: "Image 1: samplecreator's profile picture",
    ordinal: 1
  },
  {
    sourceName: "public_reader",
    remoteUrl: "https://scontent-sea5-1.cdninstagram.com/post-one.jpg",
    altText: "Image 2: Photo by Example Creator on June 24, 2024. May be an image of text.",
    ordinal: 2
  },
  {
    sourceName: "public_reader",
    remoteUrl: "https://scontent-sea5-1.cdninstagram.com/related.jpg",
    altText: "Image 6: Photo by Example Creator on May 13, 2024.",
    ordinal: 3
  }
];

describe("classifyCandidates", () => {
  it("separates profile pictures, post media, and related thumbnails", () => {
    const candidates = classifyCandidates(input, raw);
    expect(candidates[0]?.mediaKind).toBe("profile_picture");
    expect(candidates[1]?.mediaKind).toBe("carousel_item");
    expect(candidates[1]?.confidence).toBe("high");
    expect(candidates[2]?.mediaKind).toBe("related_post_thumbnail");
    expect(candidates[2]?.confidence).toBe("low");
  });
});
