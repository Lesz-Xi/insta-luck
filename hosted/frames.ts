import { createHash } from "node:crypto";
import { isAllowedHost } from "../tools/photography-collector/src/download/safeUrl.js";
import type { MediaCandidate, NormalizedInstagramUrl } from "../tools/photography-collector/src/types.js";
import type { ClientFrame, FrameGroup } from "./contract.js";
import { LIMITS } from "./limits.js";

export interface FrameDraft extends Omit<ClientFrame, "ref"> {
  readonly remoteUrl: string;
}

export interface FrameSheet {
  readonly drafts: readonly FrameDraft[];
  readonly omitted: number;
}

function groupFor(candidate: MediaCandidate): FrameGroup {
  // A video post's cover is its own image, even if the video itself can't come with it.
  return ["carousel_item", "post_image", "post_video"].includes(candidate.mediaKind) ? "post" : "nearby";
}

function fetchableUrl(remoteUrl: string): URL | undefined {
  if (remoteUrl.length > LIMITS.remoteUrlChars) return undefined;
  try {
    const url = new URL(remoteUrl);
    return url.protocol === "https:" && isAllowedHost(url.hostname) ? url : undefined;
  } catch {
    return undefined;
  }
}

/** Alt text comes from a third party. Reduce it to bounded plain text; rendering stays text-only. */
export function cleanAltText(altText: string | undefined): string | undefined {
  if (altText === undefined) return undefined;
  const text = altText
    .replace(/^Image \d+:\s*/i, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length === 0) return undefined;
  return text.length <= LIMITS.altTextChars ? text : `${text.slice(0, LIMITS.altTextChars - 1)}…`;
}

/** The date comes from third-party text too, and a real one is short. */
function cleanPostedAt(postedAt: string | undefined): string | undefined {
  const text = postedAt?.replace(/\s+/g, " ").trim();
  return text !== undefined && text.length <= LIMITS.postedAtChars ? text : undefined;
}

/**
 * Lays candidates out as a sheet: likely post media first, then everything else,
 * numbered in that order. Candidates that can't be fetched safely never become frames,
 * and on a post or Reel neither do profile pictures.
 */
export function layOutSheet(input: NormalizedInstagramUrl, candidates: readonly MediaCandidate[]): FrameSheet {
  const seen = new Set<string>();
  const usable: { readonly candidate: MediaCandidate; readonly id: string }[] = [];
  let omitted = 0;

  for (const candidate of candidates) {
    // A post page lists every commenter's picture, and nothing on it reliably says which
    // is the account's own. They aren't what anyone came for, and they aren't ours to pass on.
    if (candidate.mediaKind === "profile_picture" && input.routeType !== "profile") continue;

    const url = fetchableUrl(candidate.remoteUrl);
    if (url === undefined) {
      omitted += 1;
      continue;
    }
    // The query is signed and changes per fetch; the path identifies the file, on any page that shows it.
    // That lets a sheet built from several links recognize the same image twice.
    const id = createHash("sha256").update(url.pathname).digest("hex").slice(0, 16);
    if (seen.has(id)) continue;
    seen.add(id);
    usable.push({ candidate, id });
  }

  const ordered = [
    ...usable.filter(({ candidate }) => groupFor(candidate) === "post"),
    ...usable.filter(({ candidate }) => groupFor(candidate) === "nearby")
  ];
  const kept = ordered.slice(0, LIMITS.maxFrames);
  omitted += ordered.length - kept.length;

  const anchorIndex = kept.findIndex(({ candidate }) => candidate.basis === "first_dated_photo");
  const drafts = kept.map(({ candidate, id }, index): FrameDraft => {
    const altText = cleanAltText(candidate.altText);
    const postedAt = cleanPostedAt(candidate.postedAt);
    return {
      id,
      number: index + 1,
      group: groupFor(candidate),
      basis: candidate.basis,
      remoteUrl: candidate.remoteUrl,
      ...(candidate.basis === "same_date_as_first" && anchorIndex >= 0 ? { anchorNumber: anchorIndex + 1 } : {}),
      ...(altText === undefined ? {} : { altText }),
      ...(postedAt === undefined ? {} : { postedAt })
    };
  });

  return { drafts, omitted };
}
