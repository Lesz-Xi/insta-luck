#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { errorMessage } from "./errors.js";
import { normalizeInstagramUrl } from "./instagramUrl.js";
import { downloadCandidate } from "./download/downloader.js";
import { assertSafeMediaUrl } from "./download/safeUrl.js";
import { verifyImageBytes } from "./download/verifyImage.js";
import { PublicReaderResolver } from "./resolvers/publicReaderResolver.js";
import { defaultCollectionRoot, defaultLedgerPath } from "./storage/paths.js";
import type { MediaCandidate } from "./types.js";
import { renderWebPage } from "./webPage.js";

interface ResolveRequestBody {
  readonly url: string;
}

interface DownloadRequestBody {
  readonly id: string;
  readonly name?: string;
}

interface ClientCandidate {
  readonly id: string;
  readonly imageUrl: string;
  readonly mediaKind: string;
  readonly confidence: string;
  readonly altText?: string;
  readonly postedAt?: string;
  readonly carouselIndex?: number;
}

const candidateCache = new Map<string, MediaCandidate>();
const collectionRoot = defaultCollectionRoot();
const ledgerPath = defaultLedgerPath(collectionRoot);
const port = Number.parseInt(process.env.PHOTOGRAPHY_COLLECTOR_PORT ?? "4177", 10);

const server = createServer((request, response) => {
  void route(request, response).catch((error: unknown) => {
    sendJson(response, 500, { message: errorMessage(error) });
  });
});

server.listen(port, () => {
  console.log(`Photography Collector running at http://localhost:${port}`);
});

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (method === "GET" && url.pathname === "/") {
    sendHtml(response, renderWebPage());
    return;
  }

  if (method === "POST" && url.pathname === "/api/resolve") {
    await handleResolve(request, response);
    return;
  }

  if (method === "POST" && url.pathname === "/api/download") {
    await handleDownload(request, response);
    return;
  }

  if (method === "GET" && url.pathname.startsWith("/api/media/")) {
    await handleMediaProxy(url.pathname, response);
    return;
  }

  sendJson(response, 404, { message: "Not found." });
}

async function handleResolve(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJsonBody(request);
  if (!isResolveRequestBody(body)) {
    sendJson(response, 400, { message: "Expected JSON body: { url: string }." });
    return;
  }

  const normalized = normalizeInstagramUrl(body.url);
  const candidates = await new PublicReaderResolver().resolve(normalized);
  for (const candidate of candidates) candidateCache.set(candidate.id, candidate);

  sendJson(response, 200, {
    source: normalized.canonicalUrl,
    candidates: candidates.map(toClientCandidate)
  });
}

async function handleDownload(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJsonBody(request);
  if (!isDownloadRequestBody(body)) {
    sendJson(response, 400, { message: "Expected JSON body: { id: string, name?: string }." });
    return;
  }

  const candidate = candidateCache.get(body.id);
  if (candidate === undefined) {
    sendJson(response, 404, { message: "Candidate expired. Resolve the URL again." });
    return;
  }

  const result = await downloadCandidate(candidate, {
    collectionRoot,
    ledgerPath,
    ...(body.name === undefined ? {} : { manualName: body.name })
  });

  if (result.status.type === "downloaded") {
    sendJson(response, 200, {
      status: "downloaded",
      message: `Saved ${result.filename ?? "image"}. SHA-256 ${result.status.sha256}.`,
      path: result.status.path,
      sha256: result.status.sha256
    });
    return;
  }

  if (result.status.type === "duplicate") {
    sendJson(response, 200, {
      status: "duplicate",
      message: `Already saved at ${result.status.existingPath}. SHA-256 ${result.status.sha256}.`,
      path: result.status.existingPath,
      sha256: result.status.sha256
    });
    return;
  }

  if (result.status.type === "failed") {
    sendJson(response, 422, { status: "failed", message: `${result.status.code}: ${result.status.message}` });
    return;
  }

  sendJson(response, 500, { message: "Unexpected candidate state." });
}

async function handleMediaProxy(pathname: string, response: ServerResponse): Promise<void> {
  const id = decodeURIComponent(pathname.replace("/api/media/", ""));
  const candidate = candidateCache.get(id);
  if (candidate === undefined) {
    sendJson(response, 404, { message: "Candidate expired. Resolve the URL again." });
    return;
  }

  const url = await assertSafeMediaUrl(candidate.remoteUrl);
  const upstream = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 photography-collector/0.1" },
    signal: AbortSignal.timeout(30_000)
  });

  if (!upstream.ok) {
    sendJson(response, upstream.status, { message: `Media fetch failed with status ${upstream.status}.` });
    return;
  }

  const bytes = new Uint8Array(await upstream.arrayBuffer());
  const verified = verifyImageBytes(bytes);
  if (verified === undefined) {
    sendJson(response, 415, { message: "Resolved media is not a supported image." });
    return;
  }

  response.writeHead(200, {
    "content-type": verified.mimeType,
    "cache-control": "private, max-age=300"
  });
  response.end(Buffer.from(bytes));
}

function toClientCandidate(candidate: MediaCandidate): ClientCandidate {
  return {
    id: candidate.id,
    imageUrl: `/api/media/${encodeURIComponent(candidate.id)}`,
    mediaKind: candidate.mediaKind,
    confidence: candidate.confidence,
    ...(candidate.altText === undefined ? {} : { altText: candidate.altText }),
    ...(candidate.postedAt === undefined ? {} : { postedAt: candidate.postedAt }),
    ...(candidate.carouselIndex === undefined ? {} : { carouselIndex: candidate.carouselIndex })
  };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.trim().length === 0) return {};
  return JSON.parse(raw) as unknown;
}

function isResolveRequestBody(value: unknown): value is ResolveRequestBody {
  return isRecord(value) && typeof value.url === "string";
}

function isDownloadRequestBody(value: unknown): value is DownloadRequestBody {
  return isRecord(value) && typeof value.id === "string" && (value.name === undefined || typeof value.name === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}

function sendJson(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(body)}\n`);
}
