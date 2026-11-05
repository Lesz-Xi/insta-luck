import { describe, expect, it } from "vitest";
import { parseSelection } from "../src/ui/prompt.js";

describe("CLI selection parsing", () => {
  it("parses unique in-range selections", () => {
    expect(parseSelection("1, 2,2, 99, nope", 3)).toEqual([1, 2]);
  });
});
