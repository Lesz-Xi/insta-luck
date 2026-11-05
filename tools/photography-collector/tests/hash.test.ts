import { describe, expect, it } from "vitest";
import { sha256Bytes } from "../src/download/hash.js";

describe("sha256Bytes", () => {
  it("hashes bytes deterministically", () => {
    expect(sha256Bytes(Buffer.from("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
