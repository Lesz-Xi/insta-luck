import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CollectionLedger, CollectionLedgerEntry } from "../types.js";

const EMPTY_LEDGER: CollectionLedger = { schemaVersion: 1, entries: [] };

export async function readLedger(path: string): Promise<CollectionLedger> {
  try {
    const raw = await readFile(path, "utf8");
    return parseLedger(JSON.parse(raw) as unknown);
  } catch (error) {
    if (isNodeErrno(error, "ENOENT")) return EMPTY_LEDGER;
    throw error;
  }
}

export async function writeLedger(path: string, ledger: CollectionLedger): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

export async function appendLedgerEntry(path: string, entry: CollectionLedgerEntry): Promise<CollectionLedger> {
  const ledger = await readLedger(path);
  const next: CollectionLedger = {
    schemaVersion: 1,
    entries: [...ledger.entries, entry]
  };
  await writeLedger(path, next);
  return next;
}

export function findEntryByHash(ledger: CollectionLedger, sha256: string): CollectionLedgerEntry | undefined {
  return ledger.entries.find((entry) => entry.sha256 === sha256);
}

function parseLedger(value: unknown): CollectionLedger {
  if (!isRecord(value)) throw new Error("Ledger is not an object.");
  if (value.schemaVersion !== 1) throw new Error("Unsupported ledger schema version.");
  if (!Array.isArray(value.entries)) throw new Error("Ledger entries must be an array.");

  return {
    schemaVersion: 1,
    entries: value.entries.map(parseLedgerEntry)
  };
}

function parseLedgerEntry(value: unknown): CollectionLedgerEntry {
  if (!isRecord(value)) throw new Error("Ledger entry is not an object.");
  const id = requireString(value.id, "id");
  const originalUrl = requireString(value.originalUrl, "originalUrl");
  const source = requireString(value.source, "source") as CollectionLedgerEntry["source"];
  const mediaKind = requireString(value.mediaKind, "mediaKind") as CollectionLedgerEntry["mediaKind"];
  const localPath = requireString(value.localPath, "localPath");
  const filename = requireString(value.filename, "filename");
  const sha256 = requireString(value.sha256, "sha256");
  const bytes = requireNumber(value.bytes, "bytes");
  const mimeType = requireString(value.mimeType, "mimeType");
  const savedAt = requireString(value.savedAt, "savedAt");

  const shortcode = optionalString(value.shortcode);
  const width = optionalNumber(value.width);
  const height = optionalNumber(value.height);
  const caption = optionalString(value.caption);
  const postedAt = optionalString(value.postedAt);

  return {
    id,
    originalUrl,
    ...(shortcode === undefined ? {} : { shortcode }),
    source,
    mediaKind,
    localPath,
    filename,
    sha256,
    bytes,
    mimeType,
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(caption === undefined ? {} : { caption }),
    ...(postedAt === undefined ? {} : { postedAt }),
    savedAt
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Ledger field ${field} must be a string.`);
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Ledger field ${field} must be a finite number.`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isNodeErrno(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}
