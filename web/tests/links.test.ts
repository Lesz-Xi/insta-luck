import { describe, expect, it } from "vitest";
import { linkLabel, parseLinks } from "../src/app/links.js";

describe("reading what people paste", () => {
  it("takes one link", () => {
    const { accepted, rejected } = parseLinks("https://www.instagram.com/p/ABCDE/");
    expect(rejected).toEqual([]);
    expect(accepted.map((link) => link.label)).toEqual(["p/ABCDE"]);
  });

  it("takes a list, one to a line or split by commas, in the order given", () => {
    const { accepted } = parseLinks("instagram.com/p/AAAAA/\nhttps://www.instagram.com/nasa/, https://www.instagram.com/reel/BBBBB/");
    expect(accepted.map((link) => link.label)).toEqual(["p/AAAAA", "@nasa", "reel/BBBBB"]);
  });

  it("treats two spellings of one post as one link", () => {
    const { accepted } = parseLinks("https://www.instagram.com/p/ABCDE/?igsh=abc\nhttp://m.instagram.com/p/ABCDE/");
    expect(accepted).toHaveLength(1);
  });

  it("reports what it can't use, and keeps what it can", () => {
    const { accepted, rejected } = parseLinks("https://www.instagram.com/p/ABCDE/ https://example.com/p/ZZZZZ/");
    expect(accepted).toHaveLength(1);
    expect(rejected).toEqual([{ token: "https://example.com/p/ZZZZZ/", code: "invalid_host" }]);
  });

  it("never guesses at text that isn't a link", () => {
    expect(parseLinks("just some words").accepted).toEqual([]);
  });
});

describe("naming a link", () => {
  it.each([
    ["post", "ABCDE", "p/ABCDE"],
    ["reel", "ABCDE", "reel/ABCDE"],
    ["profile", "nasa", "@nasa"]
  ] as const)("names a %s link", (routeType, shortcode, label) => {
    expect(linkLabel(routeType, shortcode)).toBe(label);
  });
});
