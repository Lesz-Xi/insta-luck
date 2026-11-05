import type { ClientFrame } from "../../../hosted/contract.js";
import { failedIds, framesInGroup, selectedInSheetOrder, type AppState } from "./state.js";

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

export const LINK_ERRORS: Readonly<Record<string, string>> = {
  empty: "Paste an Instagram link first.",
  invalid_url: "That doesn’t look like a link. Paste the full address of a post.",
  invalid_scheme: "The link should start with https://.",
  invalid_host: "That link isn’t from instagram.com.",
  unsupported_route: "That isn’t a post, Reel or profile link. Stories and other Instagram pages aren’t supported.",
  invalid_shortcode: "That post link looks incomplete. Copy it again from Instagram."
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function isProfile(state: AppState): boolean {
  return state.sheet?.source.routeType === "profile";
}

export function resultsTitle(state: AppState): string {
  const post = framesInGroup(state, "post").length;
  if (post > 0) return `${plural(state.sheet?.frames.length ?? 0, "frame", "frames")} found`;
  return isProfile(state) ? "Only the profile picture came back" : "Nothing here is clearly from this post";
}

export function primaryGroupTitle(state: AppState): string {
  return isProfile(state) ? "Recent posts on this profile" : "Likely from this post";
}

export function nearbyNote(state: AppState): string {
  return isProfile(state)
    ? "The account’s profile picture."
    : "These were on the page but probably aren’t part of the post. Mark one only if you want it.";
}

export function resultsNote(state: AppState): string {
  const post = framesInGroup(state, "post").length;
  const nearby = framesInGroup(state, "nearby").length;
  const omitted = state.sheet?.omitted ?? 0;

  if (isProfile(state)) {
    return post > 0
      ? `${plural(post, "recent post", "recent posts")} from this profile. Instagram shows only a few publicly, so this isn’t the whole account.`
      : "The account may be private, or may have turned off embedding, so its posts can’t be read here.";
  }

  const parts = [
    post > 0
      ? `${post} likely from this post${nearby > 0 ? `, ${nearby} found nearby` : ""}. This set may be incomplete.`
      : `We found ${plural(nearby, "image", "images")} on the page but couldn’t match any to the post. Look through them and mark any you recognize.`
  ];
  if (omitted > 0) parts.push(`${plural(omitted, "other image wasn’t", "other images weren’t")} shown.`);
  if (state.sheet?.source.routeType === "reel") parts.push("This is a Reel link, so anything here is a still image, not the video.");
  if (state.lostSelection > 0) {
    parts.push(`${plural(state.lostSelection, "marked frame", "marked frames")} couldn’t be found again.`);
  }
  return parts.join(" ");
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
  if (selectedInSheetOrder(state).length > 1) return "Your browser may ask to allow several downloads.";
  return "";
}

export interface Notice {
  readonly text: string;
  readonly action?: { readonly kind: "again" | "edit"; readonly label: string };
  readonly sourceLink?: boolean;
}

export function noticeFor(state: AppState): Notice | undefined {
  switch (state.phase) {
    case "closed":
      return {
        text: "The hosted collector isn’t open right now. You can still run Insta Luck on your own computer.",
        sourceLink: true
      };
    case "failed":
      return {
        text: state.problem?.message ?? "That didn’t work. Try again.",
        ...(state.problem?.retryable === true ? { action: { kind: "again", label: "Try again" } } : {})
      };
    case "empty":
      return {
        text: "No images came back for this link. That doesn’t mean there are none: it may be private or removed, or the public reader may not have reached it.",
        action: { kind: "again", label: "Try again" }
      };
    case "results":
      if (state.expired !== false) {
        const cause =
          state.expired === "time" ? "This selection has expired." : "This selection belongs to another browser session.";
        return {
          text: `${cause} Find images again to continue; your marks carry over where the frames are found again.`,
          action: { kind: "again", label: "Find images again" }
        };
      }
      return undefined;
    default:
      return undefined;
  }
}

export function statusLine(state: AppState): string {
  switch (state.phase) {
    case "resolving":
      return "Reading the public page…";
    case "results": {
      const total = state.sheet?.frames.length ?? 0;
      return `${plural(total, "frame", "frames")} found. This set may be incomplete.`;
    }
    default:
      return "";
  }
}
