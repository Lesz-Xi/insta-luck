import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkDuplicate, checkFilesystemDuplicate } from "../src/download/dedupe.js";
import { sha256Bytes } from "../src/download/hash.js";
import type { CollectionLedger } from "../src/types.js";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "photography-dedupe-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const ledger: CollectionLedger = {
  schemaVersion: 1,
  entries: [
    {
      id: "one",
      originalUrl: "https://www.instagram.com/p/TEST_CODE_1/",
      shortcode: "TEST_CODE_1",
      source: "public_reader",
      mediaKind: "carousel_item",
      localPath: "/tmp/one.jpeg",
      filename: "one.jpeg",
      sha256: "abc",
      bytes: 3,
      mimeType: "image/jpeg",
      savedAt: "2026-08-09T00:00:00.000Z"
    }
  ]
};

describe("dedupe", () => {
  it("returns existing path for duplicate ledger hashes", () => {
    expect(checkDuplicate(ledger, "abc")).toEqual({ duplicate: true, existingPath: "/tmp/one.jpeg" });
  });

  it("returns false for new ledger hashes", () => {
    expect(checkDuplicate(ledger, "def")).toEqual({ duplicate: false });
  });

  it("finds duplicate image files even when no ledger entry exists", async () => {
    const bytes = Buffer.from("same-bytes");
    const path = join(dir, "existing.jpeg");
    await writeFile(path, bytes);

    await expect(checkFilesystemDuplicate(dir, sha256Bytes(bytes))).resolves.toEqual({ duplicate: true, existingPath: path });
  });
});
