import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { CollectorError } from "../errors.js";
import type { CollectionLedgerEntry, DownloadResult, MediaCandidate } from "../types.js";
import { appendLedgerEntry, readLedger } from "../storage/ledger.js";
import { filenameForCandidate } from "../storage/naming.js";
import { assertSafeMediaUrl } from "./safeUrl.js";
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
}

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const MAX_REDIRECTS = 5;

export async function downloadCandidate(candidate: MediaCandidate, options: DownloadOptions): Promise<DownloadResult> {
  const bytes = await fetchSafeBytes(candidate.remoteUrl, options.maxBytes ?? DEFAULT_MAX_BYTES, options.resolveDns, 0);
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

async function fetchSafeBytes(urlString: string, maxBytes: number, resolveDns: boolean | undefined, redirects: number): Promise<Uint8Array> {
  if (redirects > MAX_REDIRECTS) {
    throw new CollectorError("too_many_redirects", "Too many redirects while downloading media.");
  }

  const url = await assertSafeMediaUrl(urlString, resolveDns === undefined ? {} : { resolveDns });
  const response = await fetch(url, {
    redirect: "manual",
    headers: { "user-agent": "Mozilla/5.0 photography-collector/0.1" },
    signal: AbortSignal.timeout(30_000)
  });

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    if (location === null) throw new CollectorError("redirect_missing_location", "Redirect response had no Location header.");
    const next = new URL(location, url).toString();
    return fetchSafeBytes(next, maxBytes, resolveDns, redirects + 1);
  }

  if (!response.ok) {
    throw new CollectorError("download_failed", `Media download failed with status ${response.status}.`);
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && Number.parseInt(contentLength, 10) > maxBytes) {
    throw new CollectorError("file_too_large", `Media exceeds max byte limit of ${maxBytes}.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > maxBytes) {
    throw new CollectorError("file_too_large", `Media exceeds max byte limit of ${maxBytes}.`);
  }

  return new Uint8Array(arrayBuffer);
}

function isNodeErrno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
