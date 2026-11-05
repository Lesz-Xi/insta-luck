import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyImageBytes } from "../src/download/verifyImage.js";

describe("verifyImageBytes", () => {
  it("accepts JPEG magic bytes", async () => {
    const bytes = await readFile(resolve("tests/fixtures/tiny-valid.jpeg"));
    expect(verifyImageBytes(bytes)).toEqual({ mimeType: "image/jpeg", extension: "jpeg" });
  });

  it("rejects HTML renamed as an image", async () => {
    const bytes = await readFile(resolve("tests/fixtures/html-error-page.html"));
    expect(verifyImageBytes(bytes)).toBeUndefined();
  });
});
