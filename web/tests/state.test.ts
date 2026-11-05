import { describe, expect, it } from "vitest";
import type { ClientFrame, ResolveResponse } from "../../hosted/contract.js";
import { nearbyNote, noticeFor, primaryGroupTitle, reasonFor, resultsNote, resultsTitle, statusLine, trayStatus } from "../src/app/copy.js";
import {
  failedIds,
  initialState,
  reduce,
  retryableIds,
  selectedInSheetOrder,
  type Action,
  type AppState,
  type Problem
} from "../src/app/state.js";

function frame(number: number, overrides: Partial<ClientFrame> = {}): ClientFrame {
  return { id: `id-${number}`, ref: `ref-${number}`, number, group: "post", basis: "same_date_as_first", ...overrides };
}

function sheet(frames: readonly ClientFrame[], overrides: Partial<ResolveResponse> = {}): ResolveResponse {
  return {
    source: { canonicalUrl: "https://www.instagram.com/p/ABCDE/", shortcode: "ABCDE", routeType: "post" },
    frames,
    omitted: 0,
    expiresInMs: 1_000,
    ...overrides
  };
}

function play(...actions: readonly Action[]): AppState {
  return actions.reduce(reduce, initialState);
}

const started = (requestId: number, keepSelection = false): Action => ({ type: "resolveStarted", requestId, keepSelection });
const problem: Problem = { code: "reader_timeout", message: "Too slow.", retryable: true };

describe("resolving", () => {
  it("selects nothing by default", () => {
    const state = play(started(1), { type: "resolveSucceeded", requestId: 1, sheet: sheet([frame(1), frame(2)]) });
    expect(state.phase).toBe("results");
    expect(state.selected.size).toBe(0);
  });

  it("ignores an answer from a replaced request", () => {
    const state = play(
      started(1),
      started(2),
      { type: "resolveSucceeded", requestId: 1, sheet: sheet([frame(9)]) },
      { type: "resolveFailed", requestId: 1, problem }
    );
    expect(state.phase).toBe("resolving");
    expect(state.sheet).toBeUndefined();
  });

  it("lets the newest request win even when the older one answers last", () => {
    const newer = sheet([frame(1)]);
    const state = play(
      started(1),
      started(2),
      { type: "resolveSucceeded", requestId: 2, sheet: newer },
      { type: "resolveSucceeded", requestId: 1, sheet: sheet([frame(9)]) }
    );
    expect(state.sheet).toBe(newer);
  });

  it("ignores an answer that arrives after a cancel", () => {
    const state = play(started(1), { type: "resolveCancelled", requestId: 1 }, {
      type: "resolveSucceeded",
      requestId: 1,
      sheet: sheet([frame(1)])
    });
    expect(state.phase).toBe("idle");
    expect(state.sheet).toBeUndefined();
  });

  it("clears an earlier sheet as soon as a new link is submitted", () => {
    const state = play(started(1), { type: "resolveSucceeded", requestId: 1, sheet: sheet([frame(1)]) }, started(2));
    expect(state.sheet).toBeUndefined();
    expect(state.phase).toBe("resolving");
  });

  it("treats zero frames as not found, not as an empty post", () => {
    const state = play(started(1), { type: "resolveSucceeded", requestId: 1, sheet: sheet([]) });
    expect(state.phase).toBe("empty");
    expect(noticeFor(state)?.text).toContain("doesn’t mean there are none");
    expect(noticeFor(state)?.action?.kind).toBe("again");
  });

  it("offers a retry only for a retryable failure", () => {
    const retryable = play(started(1), { type: "resolveFailed", requestId: 1, problem });
    expect(noticeFor(retryable)?.action?.label).toBe("Try again");
    const final = play(started(1), {
      type: "resolveFailed",
      requestId: 1,
      problem: { ...problem, code: "wrong_origin", retryable: false }
    });
    expect(noticeFor(final)?.action).toBeUndefined();
  });

  it("returns a server-side link rejection to the field", () => {
    const state = play(started(1), {
      type: "resolveFailed",
      requestId: 1,
      problem: { ...problem, code: "unsupported_link", message: "Profiles aren't supported.", retryable: false }
    });
    expect(state.fieldError).toBe("Profiles aren't supported.");
    expect(state.phase).toBe("idle");
  });

  it("shows the closed state when a request finds the tool closed", () => {
    const state = play(started(1), { type: "resolveFailed", requestId: 1, problem: { ...problem, code: "closed" } });
    expect(state.phase).toBe("closed");
    expect(noticeFor(state)?.sourceLink).toBe(true);
  });
});

describe("honest result copy", () => {
  it("never calls a set complete", () => {
    const state = play(started(1), { type: "resolveSucceeded", requestId: 1, sheet: sheet([frame(1)]) });
    expect(resultsNote(state)).toContain("may be incomplete");
    expect(statusLine(state)).toContain("may be incomplete");
  });

  it("counts the sheet and keeps the two groups distinct", () => {
    const state = play(started(1), {
      type: "resolveSucceeded",
      requestId: 1,
      sheet: sheet([frame(1), frame(2), frame(3, { group: "nearby", basis: "profile_picture" })])
    });
    expect(resultsTitle(state)).toBe("3 frames found");
    expect(resultsNote(state)).toBe("2 likely from this post, 1 found nearby. This set may be incomplete.");
  });

  it("explains an ambiguous sheet instead of inventing post frames", () => {
    const state = play(started(1), {
      type: "resolveSucceeded",
      requestId: 1,
      sheet: sheet([frame(1, { group: "nearby", basis: "no_signal" })])
    });
    expect(resultsTitle(state)).toBe("Nothing here is clearly from this post");
    expect(resultsNote(state)).toContain("couldn’t match any to the post");
  });

  it("never calls a profile sheet the whole account", () => {
    const profile = sheet(
      [frame(1, { basis: "shown_on_profile" }), frame(2, { basis: "shown_on_profile" }), frame(3, { group: "nearby", basis: "profile_picture" })],
      { source: { canonicalUrl: "x", shortcode: "nasa", routeType: "profile" } }
    );
    const state = play(started(1), { type: "resolveSucceeded", requestId: 1, sheet: profile });
    expect(resultsTitle(state)).toBe("3 frames found");
    expect(resultsNote(state)).toBe(
      "2 recent posts from this profile. Instagram shows only a few publicly, so this isn’t the whole account."
    );
    expect(primaryGroupTitle(state)).toBe("Recent posts on this profile");
    expect(nearbyNote(state)).toBe("The account’s profile picture.");
  });

  it("explains a profile that returned only its picture", () => {
    const profile = sheet([frame(1, { group: "nearby", basis: "profile_picture" })], {
      source: { canonicalUrl: "x", shortcode: "someone", routeType: "profile" }
    });
    const state = play(started(1), { type: "resolveSucceeded", requestId: 1, sheet: profile });
    expect(resultsTitle(state)).toBe("Only the profile picture came back");
    expect(resultsNote(state)).toContain("private");
  });

  it("says how many images weren't shown, and flags a Reel", () => {
    const reel = sheet([frame(1)], { omitted: 2, source: { canonicalUrl: "x", shortcode: "ABCDE", routeType: "reel" } });
    const state = play(started(1), { type: "resolveSucceeded", requestId: 1, sheet: reel });
    expect(resultsNote(state)).toContain("2 other images weren’t shown.");
    expect(resultsNote(state)).toContain("not the video");
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
    expect(reasonFor(frame(1, { basis, ...overrides }))).toBe(text);
  });
});

describe("downloading", () => {
  const loaded: readonly Action[] = [
    started(1),
    { type: "resolveSucceeded", requestId: 1, sheet: sheet([frame(1), frame(2), frame(3)]) },
    { type: "frameToggled", id: "id-3", selected: true },
    { type: "frameToggled", id: "id-1", selected: true }
  ];

  it("downloads in sheet order, not in click order", () => {
    expect(selectedInSheetOrder(play(...loaded))).toEqual(["id-1", "id-3"]);
  });

  it("warns that a browser may ask about several downloads", () => {
    expect(trayStatus(play(...loaded))).toContain("may ask to allow several");
  });

  it("reports progress from real events", () => {
    const state = play(
      ...loaded,
      { type: "batchStarted", ids: ["id-1", "id-3"] },
      { type: "delivery", id: "id-1", delivery: { tag: "started" } },
      { type: "delivery", id: "id-3", delivery: { tag: "fetching" } }
    );
    expect(trayStatus(state)).toBe("Downloading 2 of 2…");
  });

  it("says a download started, never that a file was saved", () => {
    const state = play(
      ...loaded,
      { type: "batchStarted", ids: ["id-1"] },
      { type: "delivery", id: "id-1", delivery: { tag: "started" } },
      { type: "batchFinished" }
    );
    expect(trayStatus(state)).toBe("Download started. Check your browser’s downloads.");
    expect(trayStatus(state).toLowerCase()).not.toContain("saved");
  });

  it("keeps successes and the selection after a partial failure, and retries only what failed", () => {
    const state = play(
      ...loaded,
      { type: "batchStarted", ids: ["id-1", "id-3"] },
      { type: "delivery", id: "id-1", delivery: { tag: "started" } },
      { type: "delivery", id: "id-3", delivery: { tag: "failed", message: "Nope." } },
      { type: "batchFinished" }
    );
    expect(trayStatus(state)).toBe("1 download started. 1 failed.");
    expect(failedIds(state)).toEqual(["id-3"]);
    expect(state.selected.size).toBe(2);

    const retried = reduce(state, { type: "batchStarted", ids: failedIds(state) });
    expect(retried.deliveries.get("id-1")).toEqual({ tag: "started" });
    expect(retried.deliveries.get("id-3")).toEqual({ tag: "queued" });
  });
});

describe("retrying", () => {
  it("retries only failed frames that are still marked", () => {
    const state = play(
      started(1),
      { type: "resolveSucceeded", requestId: 1, sheet: sheet([frame(1), frame(2)]) },
      { type: "frameToggled", id: "id-1", selected: true },
      { type: "frameToggled", id: "id-2", selected: true },
      { type: "batchStarted", ids: ["id-1", "id-2"] },
      { type: "delivery", id: "id-1", delivery: { tag: "failed", message: "No." } },
      { type: "delivery", id: "id-2", delivery: { tag: "failed", message: "No." } },
      { type: "batchFinished" },
      { type: "frameToggled", id: "id-1", selected: false }
    );
    expect(failedIds(state)).toEqual(["id-1", "id-2"]);
    expect(retryableIds(state)).toEqual(["id-2"]);
  });
});

describe("expiry", () => {
  const loaded: readonly Action[] = [
    started(1),
    { type: "resolveSucceeded", requestId: 1, sheet: sheet([frame(1), frame(2)]) },
    { type: "frameToggled", id: "id-1", selected: true },
    { type: "frameToggled", id: "id-2", selected: true },
    { type: "selectionExpired", reason: "time" }
  ];

  it("explains expiry and offers re-resolution", () => {
    const state = play(...loaded);
    expect(state.expired).toBe("time");
    expect(noticeFor(state)?.text).toContain("has expired");
    expect(noticeFor(state)?.action?.label).toBe("Find images again");
  });

  it("doesn't call a session mismatch an expiry", () => {
    const state = play(started(1), { type: "resolveSucceeded", requestId: 1, sheet: sheet([frame(1)]) }, {
      type: "selectionExpired",
      reason: "session"
    });
    expect(noticeFor(state)?.text).toContain("another browser session");
    expect(noticeFor(state)?.text).not.toContain("expired");
  });

  it("keeps marks through a failed re-find, so trying again still restores them", () => {
    const state = play(
      ...loaded,
      started(2, true),
      { type: "resolveFailed", requestId: 2, problem },
      started(3, true),
      { type: "resolveSucceeded", requestId: 3, sheet: sheet([frame(1), frame(2)]) }
    );
    expect([...state.selected].sort()).toEqual(["id-1", "id-2"]);
    expect(state.lostSelection).toBe(0);
  });

  it("keeps marks through a cancelled re-find", () => {
    const state = play(
      ...loaded,
      started(2, true),
      { type: "resolveCancelled", requestId: 2 },
      started(3, true),
      { type: "resolveSucceeded", requestId: 3, sheet: sheet([frame(1), frame(2)]) }
    );
    expect(state.selected.size).toBe(2);
  });

  it("lets a different post start clean", () => {
    const state = play(...loaded, started(2, false));
    expect(state.selected.size).toBe(0);
  });

  it("carries marks across a re-resolve and reports any it couldn't keep", () => {
    const state = play(...loaded, started(2, true), {
      type: "resolveSucceeded",
      requestId: 2,
      sheet: sheet([frame(1), frame(3)])
    });
    expect([...state.selected]).toEqual(["id-1"]);
    expect(state.lostSelection).toBe(1);
    expect(state.expired).toBe(false);
    expect(resultsNote(state)).toContain("1 marked frame couldn’t be found again.");
  });
});
