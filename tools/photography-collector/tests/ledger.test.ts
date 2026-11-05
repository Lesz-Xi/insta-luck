import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendLedgerEntry, findEntryByHash, readLedger } from "../src/storage/ledger.js";
import type { CollectionLedgerEntry } from "../src/types.js";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "photography-ledger-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const entry: CollectionLedgerEntry = {
  id: "entry-1",
  originalUrl: "https://www.instagram.com/p/TEST_CODE_1/",
  shortcode: "TEST_CODE_1",
  source: "public_reader",
  mediaKind: "carousel_item",
  localPath: "/tmp/macro.jpeg",
  filename: "macro.jpeg",
  sha256: "hash",
  bytes: 10,
  mimeType: "image/jpeg",
  savedAt: "2026-08-09T00:00:00.000Z"
};

describe("ledger", () => {
  it("returns an empty ledger when missing", async () => {
    await expect(readLedger(join(dir, "collection-ledger.json"))).resolves.toEqual({ schemaVersion: 1, entries: [] });
  });

  it("appends and reads entries", async () => {
    const path = join(dir, "collection-ledger.json");
    await appendLedgerEntry(path, entry);
    const ledger = await readLedger(path);
    expect(ledger.entries).toHaveLength(1);
    expect(findEntryByHash(ledger, "hash")?.filename).toBe("macro.jpeg");
  });
});
