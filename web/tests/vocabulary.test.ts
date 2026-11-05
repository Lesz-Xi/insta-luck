import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ClientFrame } from "../../hosted/contract.js";
import { reasonFor } from "../src/app/copy.js";

const landing = readFileSync(resolve(import.meta.dirname, "../index.html"), "utf8");
const workspace = readFileSync(resolve(import.meta.dirname, "../app.html"), "utf8");

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
    "Likely from this post",
    "Found nearby"
  ])("the landing's sample says %s the way the workspace does", (text) => {
    expect(landing).toContain(text);
  });

  it("shares the group names with the workspace", () => {
    expect(workspace).toContain("Likely from this post");
    expect(workspace).toContain("Found nearby");
  });

  it("makes no claim the product can't support", () => {
    for (const claim of [/saved to your device/i, /original quality/i, /\bzip\b/i, /download all/i, /complete carousel/i]) {
      expect(landing).not.toMatch(claim);
      expect(workspace).not.toMatch(claim);
    }
  });

  it("labels the sample as a sample", () => {
    expect(landing).toContain("This isn’t a live result.");
  });

  it("uses no third-party script, style or font", () => {
    for (const page of [landing, workspace]) {
      expect(page).not.toMatch(/<script[^>]+src="https?:/);
      expect(page).not.toMatch(/<link[^>]+href="https?:/);
    }
  });
});
