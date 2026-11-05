import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ClientFrame } from "../../hosted/contract.js";
import { NEARBY_TITLE, primaryGroupTitle, reasonFor } from "../src/app/copy.js";
import type { SheetLink } from "../src/app/state.js";

const landing = readFileSync(resolve(import.meta.dirname, "../index.html"), "utf8");
const workspace = readFileSync(resolve(import.meta.dirname, "../app.html"), "utf8");
const postLink: SheetLink = { key: "x", url: "x", label: "x", status: "queued", read: undefined, problem: undefined, expired: false, lostMarks: 0 };

const frame = (basis: ClientFrame["basis"], extra: Partial<ClientFrame> = {}): ClientFrame => ({
  id: "x",
  ref: "x",
  number: 1,
  group: "post",
  basis,
  ...extra
});

describe("one vocabulary across both routes", () => {
  it.each([
    reasonFor(frame("first_dated_photo")),
    reasonFor(frame("same_date_as_first", { anchorNumber: 1 })),
    reasonFor(frame("listed_under_more_posts")),
    primaryGroupTitle(postLink),
    NEARBY_TITLE
  ])("the landing's sample says %s the way the workspace does", (text) => {
    expect(landing).toContain(text);
  });

  it("makes no claim the product can't support", () => {
    for (const claim of [/saved to your device/i, /original quality/i, /download all/i, /complete carousel/i]) {
      expect(landing).not.toMatch(claim);
      expect(workspace).not.toMatch(claim);
    }
  });

  it("labels the sample as a sample", () => {
    expect(landing).toContain("This isn’t a live result.");
  });

  it("uses one word for the tool on both routes", () => {
    for (const page of [landing, workspace]) expect(page).not.toMatch(/collector/i);
    expect(landing).toContain("Open the sheet");
  });

  it("uses no third-party script, style or font", () => {
    for (const page of [landing, workspace]) {
      expect(page).not.toMatch(/<script[^>]+src="https?:/);
      expect(page).not.toMatch(/<link[^>]+href="https?:/);
    }
  });
});
