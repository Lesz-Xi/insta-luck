import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { CollectionLedgerEntry, DownloadResult, MediaCandidate } from "../types.js";
import { appendLedgerEntry, readLedger } from "../storage/ledger.js";
import { filenameForCandidate } from "../storage/naming.js";
import { safeFetch, type Transport } from "./safeFetch.js";
import { sha256Bytes } from "./hash.js";
import { checkDuplicate, checkFilesystemDuplicate } from "./dedupe.js";
import { verifyImageBytes } from "./verifyImage.js";

export interface DownloadOptions {
  readonly collectionRoot: string;
  readonly ledgerPath: string;
  readonly manualName?: string;
  readonly overwrite?: boolean;
  readonly maxBytes?: number;
  readonly resolveDns?: boolean;
  /** Replaces the network, for tests. */
  readonly transport?: Transport;
}

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const DOWNLOAD_TIMEOUT_MS = 30_000;

export async function downloadCandidate(candidate: MediaCandidate, options: DownloadOptions): Promise<DownloadResult> {
  const { bytes } = await safeFetch(candidate.remoteUrl, {
    maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
    maxRedirects: MAX_REDIRECTS,
    timeoutMs: DOWNLOAD_TIMEOUT_MS,
    headers: { "user-agent": "Mozilla/5.0 photography-collector/0.1" },
    ...(options.resolveDns === undefined ? {} : { resolveDns: options.resolveDns }),
    ...(options.transport === undefined ? {} : { transport: options.transport })
  });
  const verified = verifyImageBytes(bytes);
  if (verified === undefined) {
    return {
      candidate,
      status: { type: "failed", code: "invalid_image", message: "Downloaded bytes are not a supported image." }
    };
  }

  const sha256 = sha256Bytes(bytes);
  const ledger = await readLedger(options.ledgerPath);
  const ledgerDuplicate = checkDuplicate(ledger, sha256);
  if (ledgerDuplicate.duplicate) {
    return {
      candidate,
      status: { type: "duplicate", existingPath: ledgerDuplicate.existingPath ?? "unknown", sha256 },
      mimeType: verified.mimeType
    };
  }

  const filesystemDuplicate = await checkFilesystemDuplicate(options.collectionRoot, sha256);
  if (filesystemDuplicate.duplicate) {
    return {
      candidate,
      status: { type: "duplicate", existingPath: filesystemDuplicate.existingPath ?? "unknown", sha256 },
      mimeType: verified.mimeType
    };
  }

  const filename = filenameForCandidate(candidate, verified.extension, options.manualName);
  const finalPath = resolve(options.collectionRoot, filename);
  await mkdir(options.collectionRoot, { recursive: true });

  if (options.overwrite !== true) {
    try {
      await readFile(finalPath);
      return {
        candidate,
        status: { type: "failed", code: "file_exists", message: `Refusing to overwrite existing file: ${finalPath}` },
        mimeType: verified.mimeType,
        filename
      };
    } catch (error) {
      if (!isNodeErrno(error, "ENOENT")) throw error;
    }
  }

  const tmpPath = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tmpPath, bytes);
    await rename(tmpPath, finalPath);
  } catch (error) {
    await rm(tmpPath, { force: true });
    throw error;
  }

  const entry: CollectionLedgerEntry = {
    id: `${candidate.id}-${sha256.slice(0, 12)}`,
    originalUrl: candidate.originalUrl,
    ...(candidate.shortcode === undefined ? {} : { shortcode: candidate.shortcode }),
    source: candidate.source,
    mediaKind: candidate.mediaKind,
    localPath: finalPath,
    filename: basename(finalPath),
    sha256,
    bytes: bytes.byteLength,
    mimeType: verified.mimeType,
    ...(candidate.width === undefined ? {} : { width: candidate.width }),
    ...(candidate.height === undefined ? {} : { height: candidate.height }),
    ...(candidate.caption === undefined ? {} : { caption: candidate.caption }),
    ...(candidate.postedAt === undefined ? {} : { postedAt: candidate.postedAt }),
    savedAt: new Date().toISOString()
  };

  await appendLedgerEntry(options.ledgerPath, entry);

  return {
    candidate,
    status: { type: "downloaded", path: finalPath, sha256, bytes: bytes.byteLength },
    mimeType: verified.mimeType,
    filename
  };
}

function isNodeErrno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
