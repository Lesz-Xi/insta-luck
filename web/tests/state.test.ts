import { describe, expect, it } from "vitest";
import type { ClientFrame, ResolveResponse } from "../../hosted/contract.js";
import {
  captionFor,
  linkTally,
  nearbyNote,
  noticeFor,
  primaryGroupTitle,
  reasonFor,
  receiptFor,
  rollNote,
  rollWaiting,
  sheetTitle,
  statusLine,
  trayStatus
} from "../src/app/copy.js";
import {
  deliverableIds,
  failedIds,
  initialState,
  isReading,
  reduce,
  retryableIds,
  rollsOf,
  selectedInSheetOrder,
  sheetFrames,
  type Action,
  type AppState,
  type LinkInput,
  type Problem,
  type Roll,
  type SheetLink
} from "../src/app/state.js";

const A: LinkInput = { key: "https://www.instagram.com/p/AAAAA/", url: "https://www.instagram.com/p/AAAAA/", label: "p/AAAAA" };
const B: LinkInput = { key: "https://www.instagram.com/p/BBBBB/", url: "https://www.instagram.com/p/BBBBB/", label: "p/BBBBB" };

function frame(id: string, number = 1, overrides: Partial<ClientFrame> = {}): ClientFrame {
  return { id, ref: `ref-${id}`, number, group: "post", basis: "same_date_as_first", ...overrides };
}

const nearby = (id: string, number = 2): ClientFrame => frame(id, number, { group: "nearby", basis: "listed_under_more_posts" });

function reading(frames: readonly ClientFrame[], overrides: Partial<ResolveResponse> = {}): ResolveResponse {
  return {
    source: { canonicalUrl: A.key, shortcode: "AAAAA", routeType: "post" },
    frames,
    omitted: 0,
    expiresInMs: 1_000,
    ...overrides
  };
}

function play(...actions: readonly Action[]): AppState {
  return actions.reduce(reduce, initialState);
}

const added = (...links: readonly LinkInput[]): Action => ({ type: "linksAdded", links });
const started = (link: LinkInput): Action => ({ type: "readStarted", key: link.key });
const landed = (link: LinkInput, read: ResolveResponse): Action => ({ type: "readSucceeded", key: link.key, read });
const failed = (link: LinkInput, problem: Problem): Action => ({ type: "readFailed", key: link.key, problem });
const marked = (id: string, selected = true): Action => ({ type: "frameToggled", id, selected });

/** A link added, read and answered. */
const read = (link: LinkInput, answer: ResolveResponse): readonly Action[] => [added(link), started(link), landed(link, answer)];

const problem: Problem = { code: "reader_timeout", message: "Too slow.", retryable: true };

function firstRoll(state: AppState): Roll {
  const roll = rollsOf(state)[0];
  if (roll === undefined) throw new Error("No roll");
  return roll;
}

function firstLink(state: AppState): SheetLink {
  return firstRoll(state).link;
}

describe("adding links", () => {
  it("queues them in the order given and selects nothing", () => {
    const state = play(added(A, B));
    expect(state.links.map((link) => link.status)).toEqual(["queued", "queued"]);
    expect(state.selected.size).toBe(0);
    expect(isReading(state)).toBe(true);
  });

  it("keeps one row per link", () => {
    const state = play(added(A), added(A, B));
    expect(state.links.map((link) => link.key)).toEqual([A.key, B.key]);
  });

  it("clears a field error once a link is accepted", () => {
    const state = play({ type: "linkRejected", message: "No." }, added(A));
    expect(state.fieldError).toBeUndefined();
  });
});

describe("reading", () => {
  it("selects nothing by default", () => {
    const state = play(...read(A, reading([frame("1"), frame("2")])));
    expect(firstLink(state).status).toBe("ready");
    expect(state.selected.size).toBe(0);
  });

  it("ignores an answer for a link that was removed", () => {
    const state = play(added(A), started(A), { type: "linkRemoved", key: A.key }, landed(A, reading([frame("9")])));
    expect(state.links).toEqual([]);
    expect(sheetFrames(state)).toEqual([]);
  });

  it("ignores an answer that nothing is waiting for", () => {
    const state = play(added(A), landed(A, reading([frame("9")])));
    expect(firstLink(state).status).toBe("queued");
    expect(firstLink(state).read).toBeUndefined();
  });

  it("treats zero frames as not found, not as an empty post", () => {
    const state = play(...read(A, reading([])));
    expect(firstLink(state).status).toBe("empty");
    expect(noticeFor(firstLink(state))?.text).toContain("doesn’t mean there are none");
    expect(noticeFor(firstLink(state))?.action).toBe("Try again");
  });

  it("offers a retry only for a retryable failure", () => {
    const retryable = play(added(A), started(A), failed(A, problem));
    expect(noticeFor(firstLink(retryable))?.action).toBe("Try again");
    const final = play(added(A), started(A), failed(A, { ...problem, code: "wrong_origin", retryable: false }));
    expect(noticeFor(firstLink(final))?.action).toBeUndefined();
  });

  it("returns a server-side link rejection to the field", () => {
    const state = play(added(A), started(A), failed(A, { ...problem, code: "unsupported_link", message: "Not that kind.", retryable: false }));
    expect(state.fieldError).toBe("Not that kind.");
    expect(state.links).toEqual([]);
  });

  it("shows the closed state when a read finds the tool closed", () => {
    const state = play(added(A), started(A), failed(A, { ...problem, code: "closed" }));
    expect(state.closed).toBe(true);
    expect(state.links).toEqual([]);
  });

  it("lets one link fail without touching another", () => {
    const state = play(...read(A, reading([frame("1")])), added(B), started(B), failed(B, problem));
    expect(state.links.map((link) => link.status)).toEqual(["ready", "failed"]);
    expect(sheetFrames(state)).toHaveLength(1);
  });

  it("says what a roll is waiting for until it has something to show", () => {
    expect(rollWaiting(firstLink(play(added(A))))).toBe("Waiting for its turn.");
    expect(rollWaiting(firstLink(play(added(A), started(A))))).toBe("Reading the public page…");
    expect(rollWaiting(firstLink(play(...read(A, reading([frame("1")])))))).toBeUndefined();
  });
});

describe("one sheet from several links", () => {
  it("keeps each link's frames in the order the links were added", () => {
    const state = play(...read(A, reading([frame("a1")])), ...read(B, reading([frame("b1")])));
    expect(sheetFrames(state).map(({ frame: { id } }) => id)).toEqual(["a1", "b1"]);
  });

  it("shows an image once, under the first link that found it", () => {
    const state = play(...read(A, reading([frame("a1"), nearby("shared")])), ...read(B, reading([frame("b1"), nearby("shared")])));
    const [first, second] = rollsOf(state);
    expect(first?.nearby.map(({ id }) => id)).toEqual(["shared"]);
    expect(second?.nearby).toEqual([]);
    expect(second?.repeated).toBe(1);
  });

  it("gives an image to the link that claims it as its own post", () => {
    const state = play(...read(A, reading([frame("a1"), nearby("b1")])), ...read(B, reading([frame("b1")])));
    const [first, second] = rollsOf(state);
    expect(first?.nearby).toEqual([]);
    expect(first?.repeated).toBe(1);
    expect(second?.post.map(({ id }) => id)).toEqual(["b1"]);
  });

  it("keeps a mark when its frame moves to another link", () => {
    const state = play(...read(A, reading([nearby("b1")])), marked("b1"), ...read(B, reading([frame("b1")])));
    expect(selectedInSheetOrder(state)).toEqual(["b1"]);
  });

  it("keeps marks as new links arrive", () => {
    const state = play(...read(A, reading([frame("a1")])), marked("a1"), ...read(B, reading([frame("b1")])));
    expect([...state.selected]).toEqual(["a1"]);
  });

  it("says when a link's images are shown under another", () => {
    const state = play(...read(A, reading([frame("a1"), nearby("shared")])), ...read(B, reading([frame("b1"), nearby("shared")])));
    expect(rollNote(rollsOf(state)[1] as Roll)).toContain("1 image is shown under another link.");
  });

  it("says when a link added nothing new", () => {
    const state = play(...read(A, reading([frame("a1")])), ...read(B, reading([frame("a1")])));
    expect(rollNote(rollsOf(state)[1] as Roll)).toBe("Everything on this page is already on the sheet.");
  });

  it("counts the sheet by what it shows, not by what was found", () => {
    const state = play(...read(A, reading([frame("a1"), nearby("shared")])), ...read(B, reading([frame("b1"), nearby("shared")])));
    expect(sheetTitle(state)).toBe("3 frames from 2 links");
    expect(statusLine(state)).toBe("3 frames on this sheet. This set may be incomplete.");
  });

  it("names each link's state in the rail", () => {
    const state = play(...read(A, reading([frame("a1")])), added(B));
    const [first, second] = rollsOf(state);
    expect(linkTally(first as Roll, 0)).toBe("1");
    expect(linkTally(second as Roll, 0)).toBe("Waiting");
    expect(linkTally(rollsOf(reduce(state, started(B)))[1] as Roll, 4)).toBe("4s");
  });
});

describe("which link shows a shared image", () => {
  const profile = (frames: readonly ClientFrame[]): ResolveResponse =>
    reading(frames, { source: { canonicalUrl: "x", shortcode: "nasa", routeType: "profile" } });

  it("prefers a post's own page to a profile's tile, which serves a smaller size of the same file", () => {
    const state = play(
      ...read(A, profile([frame("shared", 1, { ref: "tile", basis: "shown_on_profile" })])),
      ...read(B, reading([frame("shared", 1, { ref: "full" })]))
    );
    expect(sheetFrames(state).map(({ frame: { ref } }) => ref)).toEqual(["full"]);
    expect(rollNote(rollsOf(state)[0] as Roll)).toBe("Everything on this page is already on the sheet.");
  });

  it("still gives a profile's post to the profile over a nearby thumbnail", () => {
    const state = play(...read(A, reading([nearby("shared")])), ...read(B, profile([frame("shared", 1, { basis: "shown_on_profile" })])));
    expect(rollsOf(state)[0]?.nearby).toEqual([]);
    expect(rollsOf(state)[1]?.post.map(({ id }) => id)).toEqual(["shared"]);
  });
});

describe("removing a link", () => {
  it("takes its frames and their marks with it", () => {
    const state = play(...read(A, reading([frame("a1")])), marked("a1"), { type: "linkRemoved", key: A.key });
    expect(sheetFrames(state)).toEqual([]);
    expect(state.selected.size).toBe(0);
  });

  it("forgets its previews, so adding it back starts clean", () => {
    const state = play(
      ...read(A, reading([frame("a1")])),
      { type: "previewSettled", id: "a1", preview: "failed" },
      { type: "linkRemoved", key: A.key },
      ...read(A, reading([frame("a1")]))
    );
    expect(state.previews.get("a1")).toBe("loading");
  });

  it("ignores a delivery that lands after the link has gone", () => {
    const state = play(
      ...read(A, reading([frame("a1")])),
      marked("a1"),
      { type: "batchStarted", ids: ["a1"] },
      { type: "delivery", id: "a1", delivery: { tag: "fetching" } },
      { type: "linkRemoved", key: A.key },
      { type: "delivery", id: "a1", delivery: { tag: "failed", message: "Nope." } },
      { type: "batchFinished" }
    );
    expect(state.deliveries.size).toBe(0);
    expect(trayStatus(state)).toBe("");
  });

  it("keeps a mark another link can still show", () => {
    const state = play(
      ...read(A, reading([frame("shared")])),
      ...read(B, reading([nearby("shared")])),
      marked("shared"),
      { type: "linkRemoved", key: A.key }
    );
    expect([...state.selected]).toEqual(["shared"]);
    expect(firstRoll(state).nearby.map(({ id }) => id)).toEqual(["shared"]);
  });
});

describe("honest result copy", () => {
  it("never calls a set complete", () => {
    const state = play(...read(A, reading([frame("1")])));
    expect(rollNote(firstRoll(state))).toContain("may be incomplete");
    expect(statusLine(state)).toContain("may be incomplete");
  });

  it("counts a single link plainly and keeps the two groups distinct", () => {
    const state = play(...read(A, reading([frame("1"), frame("2"), frame("3", 3, { group: "nearby", basis: "profile_picture" })])));
    expect(sheetTitle(state)).toBe("3 frames found");
    expect(rollNote(firstRoll(state))).toBe("2 likely from this post, 1 found nearby. This set may be incomplete.");
  });

  it("explains an ambiguous sheet instead of inventing post frames", () => {
    const state = play(...read(A, reading([frame("1", 1, { group: "nearby", basis: "no_signal" })])));
    expect(sheetTitle(state)).toBe("Nothing here is clearly from this post");
    expect(rollNote(firstRoll(state))).toContain("couldn’t match any to the post");
  });

  it("has an honest heading when nothing has landed", () => {
    expect(sheetTitle(play(added(A), started(A)))).toBe("Reading your link");
    expect(sheetTitle(play(added(A), started(A), failed(A, problem)))).toBe("No frames yet");
  });

  it("never calls a profile sheet the whole account, and says how to reach further", () => {
    const profile = reading(
      [
        frame("1", 1, { basis: "shown_on_profile" }),
        frame("2", 2, { basis: "shown_on_profile" }),
        frame("3", 3, { group: "nearby", basis: "profile_picture" })
      ],
      { source: { canonicalUrl: "x", shortcode: "nasa", routeType: "profile" } }
    );
    const state = play(...read(A, profile));
    expect(sheetTitle(state)).toBe("3 frames found");
    expect(rollNote(firstRoll(state))).toBe(
      "2 recent posts from this profile. Instagram shows only a few publicly, so this isn’t the whole account. To reach an older post, paste its link."
    );
    expect(primaryGroupTitle(firstLink(state))).toBe("Recent posts on this profile");
    expect(nearbyNote(firstLink(state))).toBe("The account’s profile picture.");
  });

  it("keeps a profile frame's caption quiet, because the heading already says it", () => {
    const onProfile = frame("1", 1, { basis: "shown_on_profile" });
    expect(captionFor(onProfile)).toBeUndefined();
    expect(reasonFor(onProfile)).toBe("Recent post on this profile");
    expect(captionFor(frame("2", 2, { basis: "same_date_as_first", anchorNumber: 1 }))).toBe("Same date as frame 01");
  });

  it("explains a profile that returned only its picture", () => {
    const profile = reading([frame("1", 1, { group: "nearby", basis: "profile_picture" })], {
      source: { canonicalUrl: "x", shortcode: "someone", routeType: "profile" }
    });
    const state = play(...read(A, profile));
    expect(sheetTitle(state)).toBe("Only the profile picture came back");
    expect(rollNote(firstRoll(state))).toContain("private");
  });

  it("says how many images weren't shown, and flags a Reel", () => {
    const reel = reading([frame("1")], { omitted: 2, source: { canonicalUrl: "x", shortcode: "AAAAA", routeType: "reel" } });
    const state = play(...read(A, reel));
    expect(rollNote(firstRoll(state))).toContain("2 other images weren’t shown.");
    expect(rollNote(firstRoll(state))).toContain("not the video");
  });

  it.each<[ClientFrame["basis"], Partial<ClientFrame>, string]>([
    ["first_dated_photo", {}, "First dated photo"],
    ["same_date_as_first", { anchorNumber: 1 }, "Same date as frame 01"],
    ["photo_without_date", {}, "Photo with no date to compare"],
    ["different_date", { postedAt: "May 13, 2024" }, "Different date: May 13, 2024"],
    ["listed_under_more_posts", {}, "Listed under More posts"],
    ["profile_picture", {}, "Profile picture"],
    ["no_signal", {}, "No date or label to go on"]
  ])("states the reason for %s without a score", (basis, overrides, text) => {
    expect(reasonFor(frame("1", 1, { basis, ...overrides }))).toBe(text);
  });
});

describe("downloading", () => {
  const loaded: readonly Action[] = [...read(A, reading([frame("1"), frame("2", 2), frame("3", 3)])), marked("3"), marked("1")];

  it("downloads in sheet order, not in click order", () => {
    expect(selectedInSheetOrder(play(...loaded))).toEqual(["1", "3"]);
  });

  it("goes across links in the order they were added", () => {
    const state = play(...read(A, reading([frame("a1")])), ...read(B, reading([frame("b1")])), marked("b1"), marked("a1"));
    expect(deliverableIds(state)).toEqual(["a1", "b1"]);
  });

  it("warns that a browser may ask about several downloads", () => {
    expect(trayStatus(play(...loaded))).toContain("may ask to allow several");
  });

  it("reports progress from real events", () => {
    const state = play(
      ...loaded,
      { type: "batchStarted", ids: ["1", "3"] },
      { type: "delivery", id: "1", delivery: { tag: "started" } },
      { type: "delivery", id: "3", delivery: { tag: "fetching" } }
    );
    expect(trayStatus(state)).toBe("Downloading 2 of 2…");
  });

  it("says a download started, never that a file was saved", () => {
    const state = play(
      ...loaded,
      { type: "batchStarted", ids: ["1"] },
      { type: "delivery", id: "1", delivery: { tag: "started" } },
      { type: "batchFinished" }
    );
    expect(trayStatus(state)).toBe("Download started. Check your browser’s downloads.");
    expect(trayStatus(state).toLowerCase()).not.toContain("saved");
    expect(receiptFor(1).toLowerCase()).not.toContain("saved");
    expect(receiptFor(3)).toBe("3 started");
  });

  it("keeps successes and the selection after a partial failure, and retries only what failed", () => {
    const state = play(
      ...loaded,
      { type: "batchStarted", ids: ["1", "3"] },
      { type: "delivery", id: "1", delivery: { tag: "started" } },
      { type: "delivery", id: "3", delivery: { tag: "failed", message: "Nope." } },
      { type: "batchFinished" }
    );
    expect(trayStatus(state)).toBe("1 download started. 1 failed.");
    expect(failedIds(state)).toEqual(["3"]);
    expect(state.selected.size).toBe(2);

    const retried = reduce(state, { type: "batchStarted", ids: failedIds(state) });
    expect(retried.deliveries.get("1")).toEqual({ tag: "started" });
    expect(retried.deliveries.get("3")).toEqual({ tag: "queued" });
  });
});

describe("retrying", () => {
  it("retries only failed frames that are still marked", () => {
    const state = play(
      ...read(A, reading([frame("1"), frame("2", 2)])),
      marked("1"),
      marked("2"),
      { type: "batchStarted", ids: ["1", "2"] },
      { type: "delivery", id: "1", delivery: { tag: "failed", message: "No." } },
      { type: "delivery", id: "2", delivery: { tag: "failed", message: "No." } },
      { type: "batchFinished" },
      marked("1", false)
    );
    expect(failedIds(state)).toEqual(["1", "2"]);
    expect(retryableIds(state)).toEqual(["2"]);
  });
});

describe("expiry", () => {
  const loaded: readonly Action[] = [
    ...read(A, reading([frame("1"), frame("2", 2)])),
    marked("1"),
    marked("2"),
    { type: "linkExpired", key: A.key, reason: "time" }
  ];
  const readAgain: Action = { type: "readQueued", key: A.key };

  it("explains expiry, keeps the frames and offers a fresh read", () => {
    const state = play(...loaded);
    expect(firstLink(state).status).toBe("expired");
    expect(noticeFor(firstLink(state))?.text).toContain("has expired");
    expect(noticeFor(firstLink(state))?.action).toBe("Read again");
    expect(sheetFrames(state)).toHaveLength(2);
  });

  it("doesn't call a session mismatch an expiry", () => {
    const state = play(...read(A, reading([frame("1")])), { type: "linkExpired", key: A.key, reason: "session" });
    expect(noticeFor(firstLink(state))?.text).toContain("another browser session");
    expect(noticeFor(firstLink(state))?.text).not.toContain("expired");
  });

  it("expires one link without touching another", () => {
    const state = play(...read(A, reading([frame("a1")])), ...read(B, reading([frame("b1")])), marked("a1"), marked("b1"), {
      type: "linkExpired",
      key: A.key,
      reason: "time"
    });
    expect(state.links.map((link) => link.status)).toEqual(["expired", "ready"]);
    expect(deliverableIds(state)).toEqual(["b1"]);
    expect(trayStatus(state)).toBe("1 marked frame needs its link read again.");
  });

  it("can't deliver from an expired link", () => {
    expect(deliverableIds(play(...loaded))).toEqual([]);
  });

  it("keeps frames and marks through a failed re-read, so trying again still restores them", () => {
    const state = play(
      ...loaded,
      readAgain,
      started(A),
      failed(A, problem),
      readAgain,
      started(A),
      landed(A, reading([frame("1"), frame("2", 2)]))
    );
    expect([...state.selected].sort()).toEqual(["1", "2"]);
    expect(firstLink(state).lostMarks).toBe(0);
    expect(firstLink(state).status).toBe("ready");
  });

  it("carries marks across a re-read and reports any it couldn't keep", () => {
    const state = play(...loaded, readAgain, started(A), landed(A, reading([frame("1"), frame("3", 2)])));
    expect([...state.selected]).toEqual(["1"]);
    expect(firstLink(state).lostMarks).toBe(1);
    expect(firstLink(state).expired).toBe(false);
    expect(rollNote(firstRoll(state))).toContain("1 marked frame couldn’t be found again.");
  });

  it("reports a lost mark on a profile too", () => {
    const profile = (id: string): ResolveResponse =>
      reading([frame(id, 1, { basis: "shown_on_profile" })], { source: { canonicalUrl: "x", shortcode: "nasa", routeType: "profile" } });
    const state = play(...read(A, profile("old")), marked("old"), readAgain, started(A), landed(A, profile("new")));
    expect(rollNote(firstRoll(state))).toContain("1 marked frame couldn’t be found again.");
  });

  it("reports a lost mark when a re-read found nothing new", () => {
    const state = play(
      ...read(B, reading([frame("kept")])),
      ...read(A, reading([frame("gone", 1)])),
      marked("gone"),
      readAgain,
      started(A),
      landed(A, reading([frame("kept")]))
    );
    expect(rollNote(rollsOf(state)[1] as Roll)).toBe("Everything on this page is already on the sheet. 1 marked frame couldn’t be found again.");
  });

  it("gives a failed preview a fresh chance on a re-read, and leaves a loaded one alone", () => {
    const state = play(
      ...read(A, reading([frame("1"), frame("2", 2)])),
      { type: "previewSettled", id: "1", preview: "failed" },
      { type: "previewSettled", id: "2", preview: "ready" },
      readAgain,
      started(A),
      landed(A, reading([frame("1"), frame("2", 2)]))
    );
    expect(state.previews.get("1")).toBe("loading");
    expect(state.previews.get("2")).toBe("ready");
  });

  it("uses the newest reference after a re-read", () => {
    const state = play(...loaded, readAgain, started(A), landed(A, reading([frame("1", 1, { ref: "fresh" })])));
    expect(sheetFrames(state)[0]?.frame.ref).toBe("fresh");
  });
});
