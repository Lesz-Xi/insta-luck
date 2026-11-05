import { createHash } from "node:crypto";
import type { MediaCandidate, MediaKind, NormalizedInstagramUrl } from "../types.js";
import type { RawMediaCandidate } from "./resolverTypes.js";

function stableId(input: NormalizedInstagramUrl, raw: RawMediaCandidate): string {
  const hash = createHash("sha256")
    .update(`${input.shortcode}:${raw.ordinal}:${raw.remoteUrl}`)
    .digest("hex")
    .slice(0, 16);
  return `${input.shortcode}-${hash}`;
}

function extractPostedAt(text: string): string | undefined {
  const monthDayYear = text.match(/on\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/);
  return monthDayYear?.[1];
}

function classifyKind(raw: RawMediaCandidate): MediaKind {
  const text = `${raw.altText ?? ""} ${raw.contextText ?? ""}`.toLowerCase();

  if (text.includes("profile picture")) return "profile_picture";
  if (text.includes("more posts") || text.includes("related")) return "related_post_thumbnail";
  if (text.includes("photo by") && text.includes("image of")) return "carousel_item";
  if (text.includes("photo by")) return "carousel_item";
  if (text.includes("video")) return "post_video";
  return "unknown";
}

function confidenceFor(kind: MediaKind, raw: RawMediaCandidate, firstPostDate?: string): "high" | "medium" | "low" {
  if (kind === "profile_picture" || kind === "related_post_thumbnail") return "low";
  if (kind === "carousel_item" || kind === "post_image") {
    const postedAt = extractPostedAt(raw.altText ?? "");
    if (postedAt !== undefined && firstPostDate !== undefined && postedAt === firstPostDate) return "high";
    return "medium";
  }
  return "low";
}

function normalizeKindByDate(kind: MediaKind, raw: RawMediaCandidate, firstPostDate?: string): MediaKind {
  if (kind !== "carousel_item" && kind !== "post_image") return kind;
  const postedAt = extractPostedAt(raw.altText ?? "");
  if (firstPostDate !== undefined && postedAt !== undefined && postedAt !== firstPostDate) {
    return "related_post_thumbnail";
  }
  return kind;
}

export function classifyCandidates(
  input: NormalizedInstagramUrl,
  rawCandidates: readonly RawMediaCandidate[]
): readonly MediaCandidate[] {
  const postDates = rawCandidates
    .filter((candidate) => !`${candidate.altText ?? ""}`.toLowerCase().includes("profile picture"))
    .map((candidate) => extractPostedAt(candidate.altText ?? ""))
    .filter((value): value is string => value !== undefined);
  const firstPostDate = postDates[0];
  let carouselIndex = 0;

  return rawCandidates.map((raw) => {
    const initialKind = classifyKind(raw);
    const mediaKind = normalizeKindByDate(initialKind, raw, firstPostDate);
    const postedAt = extractPostedAt(raw.altText ?? "");
    const isPostMedia = mediaKind === "carousel_item" || mediaKind === "post_image" || mediaKind === "post_video";
    const nextCarouselIndex = isPostMedia ? carouselIndex + 1 : undefined;
    if (isPostMedia) carouselIndex += 1;

    return {
      id: stableId(input, raw),
      source: "public_reader",
      originalUrl: input.canonicalUrl,
      shortcode: input.shortcode,
      remoteUrl: raw.remoteUrl,
      mediaKind,
      ...(nextCarouselIndex === undefined ? {} : { carouselIndex: nextCarouselIndex }),
      ...(raw.altText === undefined ? {} : { altText: raw.altText }),
      ...(postedAt === undefined ? {} : { postedAt }),
      confidence: confidenceFor(mediaKind, raw, firstPostDate),
      status: { type: "candidate" }
    } satisfies MediaCandidate;
  });
}
