import type { MediaCandidate, MediaKind } from "../types.js";

const GROUP_ORDER: readonly MediaKind[] = [
  "carousel_item",
  "post_image",
  "post_video",
  "related_post_thumbnail",
  "profile_picture",
  "unknown"
];

const GROUP_LABELS: Record<MediaKind, string> = {
  carousel_item: "Likely post/carousel media",
  post_image: "Likely post images",
  post_video: "Likely post videos",
  related_post_thumbnail: "Related thumbnails",
  profile_picture: "Profile pictures",
  unknown: "Unknown candidates"
};

export function renderCandidates(candidates: readonly MediaCandidate[]): string {
  if (candidates.length === 0) return "No media candidates resolved.";

  const lines: string[] = [`Resolved ${candidates.length} media candidate${candidates.length === 1 ? "" : "s"}.`];

  for (const kind of GROUP_ORDER) {
    const group = candidates.filter((candidate) => candidate.mediaKind === kind);
    if (group.length === 0) continue;
    lines.push("", `${GROUP_LABELS[kind]}:`);
    for (const candidate of group) {
      const index = candidates.indexOf(candidate) + 1;
      const date = candidate.postedAt === undefined ? "unknown date" : candidate.postedAt;
      const carousel = candidate.carouselIndex === undefined ? "" : ` item ${candidate.carouselIndex}`;
      const alt = candidate.altText === undefined ? "" : ` — ${truncate(candidate.altText, 96)}`;
      lines.push(`  [${index}] ${candidate.mediaKind}${carousel} — ${candidate.confidence} — ${date}${alt}`);
    }
  }

  return lines.join("\n");
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}
