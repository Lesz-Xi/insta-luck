import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { downloadCandidate } from "../src/download/downloader.js";
import type { Transport } from "../src/download/safeFetch.js";
import { normalizeInstagramUrl } from "../src/instagramUrl.js";
import { classifyCandidates } from "../src/resolvers/candidateClassifier.js";
import { extractMarkdownImageCandidates } from "../src/resolvers/publicReaderResolver.js";
import { readLedger } from "../src/storage/ledger.js";
import type { MediaCandidate } from "../src/types.js";

const serve = (bytes: Uint8Array): Transport =>
  async () => ({
    status: 200,
    header: () => undefined,
    body: (async function* body() {
      yield bytes;
    })(),
    destroy: () => undefined
  });

async function firstPostCandidate(): Promise<MediaCandidate> {
  const fixture = await readFile(resolve("tests/fixtures/instagram-reader-sample.md"), "utf8");
  const input = normalizeInstagramUrl("https://www.instagram.com/p/TEST_CODE_1/");
  const candidate = classifyCandidates(input, extractMarkdownImageCandidates(fixture)).find(
    (item) => item.mediaKind === "carousel_item"
  );
  if (candidate === undefined) throw new Error("expected a post candidate");
  return candidate;
}

describe("local archiving", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "insta-luck-collection-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("writes verified bytes and a ledger entry, then recognizes the duplicate", async () => {
    const bytes = new Uint8Array(await readFile(resolve("tests/fixtures/tiny-valid.jpeg")));
    const options = { collectionRoot: root, ledgerPath: join(root, "ledger.json"), transport: serve(bytes) };
    const candidate = await firstPostCandidate();

    const first = await downloadCandidate(candidate, options);
    expect(first.status.type).toBe("downloaded");
    const files = (await readdir(root)).filter((name) => name.endsWith(".jpeg"));
    expect(files).toHaveLength(1);
    expect(new Uint8Array(await readFile(join(root, files[0] ?? "")))).toEqual(bytes);

    const ledger = await readLedger(options.ledgerPath);
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]?.mediaKind).toBe("carousel_item");

    const second = await downloadCandidate(candidate, options);
    expect(second.status.type).toBe("duplicate");
    expect((await readLedger(options.ledgerPath)).entries).toHaveLength(1);
  });

  it("refuses bytes that aren't an image and writes nothing", async () => {
    const options = {
      collectionRoot: root,
      ledgerPath: join(root, "ledger.json"),
      transport: serve(new TextEncoder().encode("<html>login</html>"))
    };
    const result = await downloadCandidate(await firstPostCandidate(), options);
    expect(result.status).toMatchObject({ type: "failed", code: "invalid_image" });
    expect(await readdir(root)).toEqual([]);
  });
});
