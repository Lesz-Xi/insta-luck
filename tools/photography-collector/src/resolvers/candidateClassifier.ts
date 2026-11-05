import { createHash } from "node:crypto";
import type { CandidateBasis, MediaCandidate, MediaKind, NormalizedInstagramUrl } from "../types.js";
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
  const alt = (raw.altText ?? "").toLowerCase();
  const context = (raw.contextText ?? "").toLowerCase();

  if (alt.includes("profile picture")) return "profile_picture";
  // Page structure first: alt text can carry a caption, so its words are weaker evidence.
  if (context.includes("more posts") || context.includes("related")) return "related_post_thumbnail";
  if (alt.includes("photo by")) return "carousel_item";
  if (alt.includes("more posts") || alt.includes("related")) return "related_post_thumbnail";
  if (alt.includes("video")) return "post_video";
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

function isUnderMorePosts(raw: RawMediaCandidate): boolean {
  return (raw.contextText ?? "").toLowerCase().includes("more posts");
}

function basisFor(
  raw: RawMediaCandidate,
  initialKind: MediaKind,
  mediaKind: MediaKind,
  postedAt: string | undefined,
  firstPostDate: string | undefined,
  isFirstDated: boolean
): CandidateBasis {
  if (mediaKind === "profile_picture") return "profile_picture";
  if (isUnderMorePosts(raw)) return "listed_under_more_posts";
  if (mediaKind === "post_video") return "mentions_video";
  if (mediaKind === "related_post_thumbnail") {
    return initialKind === "related_post_thumbnail" ? "described_as_related" : "different_date";
  }
  if (mediaKind === "carousel_item" || mediaKind === "post_image") {
    if (postedAt === undefined || firstPostDate === undefined) return "photo_without_date";
    return isFirstDated ? "first_dated_photo" : "same_date_as_first";
  }
  return "no_signal";
}

/** A profile's embed page lists the account's picture and its recent posts, so there is no post to sort against. */
function classifyProfileCandidates(
  input: NormalizedInstagramUrl,
  rawCandidates: readonly RawMediaCandidate[]
): readonly MediaCandidate[] {
  return rawCandidates.map((raw) => {
    const isPicture = classifyKind(raw) === "profile_picture";
    return {
      id: stableId(input, raw),
      source: "public_reader",
      originalUrl: input.canonicalUrl,
      shortcode: input.shortcode,
      remoteUrl: raw.remoteUrl,
      mediaKind: isPicture ? "profile_picture" : "post_image",
      basis: isPicture ? "profile_picture" : "shown_on_profile",
      ...(raw.altText === undefined ? {} : { altText: raw.altText }),
      confidence: isPicture ? "low" : "medium",
      status: { type: "candidate" }
    } satisfies MediaCandidate;
  });
}

export function classifyCandidates(
  input: NormalizedInstagramUrl,
  rawCandidates: readonly RawMediaCandidate[]
): readonly MediaCandidate[] {
  if (input.routeType === "profile") return classifyProfileCandidates(input, rawCandidates);

  // Dates anchor post membership, so an image already known to sit below the
  // "More posts" boundary cannot be the anchor.
  const postDates = rawCandidates
    .filter((candidate) => !`${candidate.altText ?? ""}`.toLowerCase().includes("profile picture"))
    .filter((candidate) => !isUnderMorePosts(candidate))
    .map((candidate) => extractPostedAt(candidate.altText ?? ""))
    .filter((value): value is string => value !== undefined);
  const firstPostDate = postDates[0];
  let carouselIndex = 0;
  let anchorSeen = false;

  return rawCandidates.map((raw) => {
    const initialKind = classifyKind(raw);
    const mediaKind = normalizeKindByDate(initialKind, raw, firstPostDate);
    const postedAt = extractPostedAt(raw.altText ?? "");
    const isFirstDated = !anchorSeen && postedAt !== undefined && postedAt === firstPostDate && mediaKind === "carousel_item";
    if (isFirstDated) anchorSeen = true;
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
      basis: basisFor(raw, initialKind, mediaKind, postedAt, firstPostDate, isFirstDated),
      ...(nextCarouselIndex === undefined ? {} : { carouselIndex: nextCarouselIndex }),
      ...(raw.altText === undefined ? {} : { altText: raw.altText }),
      ...(postedAt === undefined ? {} : { postedAt }),
      confidence: confidenceFor(mediaKind, raw, firstPostDate),
      status: { type: "candidate" }
    } satisfies MediaCandidate;
  });
}
