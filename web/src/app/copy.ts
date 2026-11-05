import type { ClientFrame } from "../../../hosted/contract.js";
import {
  deliverableIds,
  failedIds,
  isReading,
  MAX_LINKS,
  rollsOf,
  selectedInSheetOrder,
  type AppState,
  type Roll,
  type SheetLink
} from "./state.js";

export function frameLabel(number: number): string {
  return String(number).padStart(2, "0");
}

/** What a frame's place on the sheet rests on. Never a score. */
export function reasonFor(frame: ClientFrame): string {
  switch (frame.basis) {
    case "first_dated_photo":
      return "First dated photo";
    case "same_date_as_first":
      return frame.anchorNumber === undefined ? "Same date as the first photo" : `Same date as frame ${frameLabel(frame.anchorNumber)}`;
    case "photo_without_date":
      return "Photo with no date to compare";
    case "different_date":
      return frame.postedAt === undefined ? "Different date" : `Different date: ${frame.postedAt}`;
    case "listed_under_more_posts":
      return "Listed under More posts";
    case "shown_on_profile":
      return "Recent post on this profile";
    case "described_as_related":
      return "Described as related";
    case "profile_picture":
      return "Profile picture";
    case "mentions_video":
      return "Mentions video. Still image only";
    case "no_signal":
      return "No date or label to go on";
  }
}

/** The group heading already says this for every frame on a profile, so the caption stays quiet. */
export function captionFor(frame: ClientFrame): string | undefined {
  return frame.basis === "shown_on_profile" ? undefined : reasonFor(frame);
}

export const LINK_ERRORS: Readonly<Record<string, string>> = {
  empty: "Paste an Instagram link first.",
  invalid_url: "That doesn’t look like a link. Paste the full address of a post.",
  invalid_scheme: "The link should start with https://.",
  invalid_host: "That link isn’t from instagram.com.",
  unsupported_route: "That isn’t a post, Reel or profile link. Stories and other Instagram pages aren’t supported.",
  invalid_shortcode: "That post link looks incomplete. Copy it again from Instagram.",
  duplicate: "That link is already on this sheet.",
  too_many: `A sheet holds ${MAX_LINKS} links. Download what you need, or remove a link first.`
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function isProfile(link: SheetLink): boolean {
  return link.read?.source.routeType === "profile";
}

function visibleCount(roll: Roll): number {
  return roll.post.length + roll.nearby.length;
}

export const NEARBY_TITLE = "Found nearby";

export function primaryGroupTitle(link: SheetLink): string {
  return isProfile(link) ? "Recent posts on this profile" : "Likely from this post";
}

export const NEARBY_NOTE = "These were on the page but probably aren’t part of the post. Mark one only if you want it.";

/** The sheet's heading. A single link keeps the plain answer; several links say what the count covers. */
export function sheetTitle(state: AppState): string {
  const rolls = rollsOf(state).filter(({ link }) => link.read !== undefined && link.read.frames.length > 0);
  const total = rolls.reduce((sum, roll) => sum + visibleCount(roll), 0);
  const only = rolls.length === 1 ? rolls[0] : undefined;

  if (only === undefined) {
    if (rolls.length > 0) return `${plural(total, "frame", "frames")} from ${plural(rolls.length, "link", "links")}`;
    return isReading(state) ? "Reading your link" : "No frames yet";
  }
  return only.post.length > 0 ? `${plural(total, "frame", "frames")} found` : "Nothing here is clearly from this post";
}

export function rollNote(roll: Roll): string {
  const { link, post, nearby, repeated } = roll;
  // Nothing came back, so the link's notice does the talking.
  if (link.read === undefined || link.read.frames.length === 0) return "";

  const repeats = repeated > 0 ? `${plural(repeated, "image is", "images are")} shown under another link.` : undefined;
  const lost = link.lostMarks > 0 ? `${plural(link.lostMarks, "marked frame", "marked frames")} couldn’t be found again.` : undefined;

  if (post.length === 0 && nearby.length === 0 && repeated > 0) {
    return ["Everything on this page is already on the sheet.", lost].filter((part) => part !== undefined).join(" ");
  }

  if (isProfile(link)) {
    return [
      `${plural(post.length, "recent post", "recent posts")} from this profile. Instagram shows only a few publicly, so this isn’t the whole account. To reach an older post, paste its link.`,
      repeats,
      lost
    ]
      .filter((part) => part !== undefined)
      .join(" ");
  }

  const omitted = link.read.omitted;
  const parts = [
    post.length > 0
      ? `${post.length} likely from this post${nearby.length > 0 ? `, ${nearby.length} found nearby` : ""}. This set may be incomplete.`
      : `We found ${plural(nearby.length, "image", "images")} on the page but couldn’t match any to the post. Look through them and mark any you recognize.`,
    repeats,
    omitted > 0 ? `${plural(omitted, "other image wasn’t", "other images weren’t")} shown.` : undefined,
    link.read.source.routeType === "reel" ? "This is a Reel link, so anything here is a still image, not the video." : undefined,
    lost
  ];
  return parts.filter((part) => part !== undefined).join(" ");
}

/** What a roll says while it has nothing to show yet. */
export function rollWaiting(link: SheetLink): string | undefined {
  if (link.read !== undefined) return undefined;
  if (link.status === "reading") return "Reading the public page…";
  return link.status === "queued" ? "Waiting for its turn." : undefined;
}

/** The short state of a link in the rail. */
export function linkTally(roll: Roll, elapsedSeconds: number): string {
  switch (roll.link.status) {
    case "queued":
      return "Waiting";
    case "reading":
      return `${elapsedSeconds}s`;
    case "failed":
      return "Failed";
    case "expired":
      return "Expired";
    case "empty":
      return "None";
    case "ready":
      return String(visibleCount(roll));
  }
}

export function trayCount(state: AppState): string {
  return `${state.selected.size} selected`;
}

export function trayStatus(state: AppState): string {
  const deliveries = [...state.deliveries.values()];
  const started = deliveries.filter((delivery) => delivery.tag === "started").length;
  const failed = failedIds(state).length;

  if (state.batchActive) {
    const finished = started + failed;
    return `Downloading ${Math.min(finished + 1, deliveries.length)} of ${deliveries.length}…`;
  }
  if (failed > 0 && started > 0) {
    return `${plural(started, "download", "downloads")} started. ${failed} failed.`;
  }
  if (failed > 0) return `${plural(failed, "download", "downloads")} failed.`;
  if (started > 0) {
    return started === 1
      ? "Download started. Check your browser’s downloads."
      : `${started} downloads started. Check your browser’s downloads.`;
  }

  const waiting = selectedInSheetOrder(state).length - deliverableIds(state).length;
  if (waiting > 0) return `${plural(waiting, "marked frame needs", "marked frames need")} its link read again.`;
  if (selectedInSheetOrder(state).length > 1) return "Your browser may ask to allow several downloads.";
  return "";
}

/** The receipt on the button itself: only after the bytes really reached the browser. */
export function receiptFor(started: number): string {
  return started === 1 ? "1 started" : `${started} started`;
}

export interface Notice {
  readonly text: string;
  readonly action?: string;
}

export function closedNotice(): string {
  return "Insta Luck isn’t open here right now. You can still run it on your own computer.";
}

export function noticeFor(link: SheetLink): Notice | undefined {
  switch (link.status) {
    case "failed":
      return {
        text: link.problem?.message ?? "That didn’t work. Try again.",
        ...(link.problem?.retryable === true ? { action: "Try again" } : {})
      };
    case "empty":
      return {
        text: isProfile(link)
          ? "No posts came back for this profile. The account may be private, or may have turned off embedding, so its posts can’t be read here."
          : "No images came back for this link. That doesn’t mean there are none: it may be private or removed, or the public reader may not have reached it.",
        action: "Try again"
      };
    case "expired": {
      const cause = link.expired === "session" ? "This link belongs to another browser session." : "This link has expired.";
      return { text: `${cause} Read it again to continue; your marks carry over where the frames are found again.`, action: "Read again" };
    }
    default:
      return undefined;
  }
}

export function statusLine(state: AppState): string {
  const waiting = state.links.filter((link) => link.status === "queued").length;
  const reading = state.links.find((link) => link.status === "reading");

  if (reading !== undefined || waiting > 0) {
    return waiting > 0 ? `Reading the public page… ${plural(waiting, "link", "links")} waiting.` : "Reading the public page…";
  }

  const rolls = rollsOf(state);
  const total = rolls.reduce((sum, roll) => sum + visibleCount(roll), 0);
  return total > 0 ? `${plural(total, "frame", "frames")} on this sheet. This set may be incomplete.` : "";
}
