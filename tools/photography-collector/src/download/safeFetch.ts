import { lookup as dnsLookup, type LookupAddress, type LookupAllOptions, type LookupOneOptions } from "node:dns";
import { request as httpsRequest, type RequestOptions } from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";
import { CollectorError } from "../errors.js";
import { assertSafeMediaUrl, isPrivateAddress } from "./safeUrl.js";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_MAX_REDIRECTS = 3;

export interface TransportResponse {
  readonly status: number;
  readonly header: (name: string) => string | undefined;
  readonly body: AsyncIterable<Uint8Array>;
  readonly destroy: () => void;
}

export interface TransportInit {
  readonly headers: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
  readonly resolveDns: boolean;
}

export type Transport = (url: URL, init: TransportInit) => Promise<TransportResponse>;

export interface SafeFetchOptions {
  readonly maxBytes: number;
  readonly timeoutMs: number;
  readonly allowedHostSuffixes?: readonly string[];
  readonly maxRedirects?: number;
  readonly headers?: Readonly<Record<string, string>>;
  /** Validate the addresses a host resolves to at connection time. */
  readonly resolveDns?: boolean;
  readonly signal?: AbortSignal;
  readonly transport?: Transport;
}

export interface SafeFetchResult {
  readonly bytes: Uint8Array;
  readonly finalUrl: URL;
}

/**
 * The one way this project reads a remote URL. Every hop is checked before it
 * is requested, addresses are checked when the socket connects rather than in a
 * separate earlier lookup, and the byte limit applies while reading, so an
 * oversized or unlabeled body is abandoned instead of buffered.
 */
export async function safeFetch(urlString: string, options: SafeFetchOptions): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const transport = options.transport ?? nodeTransport;
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal === undefined ? timeout : AbortSignal.any([timeout, options.signal]);
  const init: TransportInit = {
    headers: options.headers ?? {},
    signal,
    resolveDns: options.resolveDns !== false
  };

  try {
    let current = urlString;
    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      const url = await assertSafeMediaUrl(current, {
        resolveDns: false,
        ...(options.allowedHostSuffixes === undefined ? {} : { allowedHostSuffixes: options.allowedHostSuffixes })
      });
      signal.throwIfAborted();
      const response = await transport(url, init);

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.header("location");
        response.destroy();
        if (location === undefined) {
          throw new CollectorError("redirect_missing_location", "Redirect response had no Location header.");
        }
        current = new URL(location, url).toString();
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        response.destroy();
        throw new CollectorError(
          "download_failed",
          `Media download failed with status ${response.status}.`,
          response.status
        );
      }

      return { bytes: await readBounded(response, options.maxBytes), finalUrl: url };
    }
  } catch (error) {
    if (timeout.aborted) throw new CollectorError("upstream_timeout", "The remote server took too long to respond.");
    if (options.signal?.aborted === true) throw new CollectorError("aborted", "The request was cancelled.");
    throw error;
  }

  throw new CollectorError("too_many_redirects", "Too many redirects while downloading media.");
}

async function readBounded(response: TransportResponse, maxBytes: number): Promise<Uint8Array> {
  const declared = Number.parseInt(response.header("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > maxBytes) {
    response.destroy();
    throw new CollectorError("file_too_large", `Media exceeds max byte limit of ${maxBytes}.`);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      response.destroy();
      throw new CollectorError("file_too_large", `Media exceeds max byte limit of ${maxBytes}.`);
    }
    chunks.push(chunk);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number
) => void;

/**
 * A DNS lookup for `net.connect` that refuses private targets. Because the
 * socket connects to exactly what this returns, a host can't pass an earlier
 * check and then rebind to an internal address.
 */
export function guardedLookup(
  hostname: string,
  options: LookupOneOptions | LookupAllOptions,
  callback: LookupCallback,
  resolve: typeof dnsLookup = dnsLookup
): void {
  resolve(hostname, { ...options, all: true }, (error, addresses) => {
    if (error !== null) {
      callback(error, "");
      return;
    }

    const first = addresses[0];
    if (first === undefined) {
      callback(new CollectorError("dns_empty", `No DNS records for ${hostname}.`), "");
      return;
    }
    if (addresses.some((record) => isPrivateAddress(record.address))) {
      callback(new CollectorError("unsafe_dns_target", `${hostname} resolves to a private or internal address.`), "");
      return;
    }

    if (options.all === true) callback(null, addresses);
    else callback(null, first.address, first.family);
  });
}

export interface NodeTransportOptions {
  /** Test seam for exercising real sockets without TLS. */
  readonly request?: (url: URL, options: RequestOptions) => ClientRequest;
  readonly lookup?: RequestOptions["lookup"];
}

export function createNodeTransport(transportOptions: NodeTransportOptions = {}): Transport {
  const send = transportOptions.request ?? ((url, options) => httpsRequest(url, options));

  return (url, init) =>
    new Promise((resolve, reject) => {
      const request = send(url, {
        method: "GET",
        headers: { accept: "*/*", ...init.headers },
        signal: init.signal,
        ...(init.resolveDns ? { lookup: transportOptions.lookup ?? (guardedLookup as RequestOptions["lookup"]) } : {})
      });
      request.once("error", reject);
      request.once("response", (message: IncomingMessage) => {
        // Past this point body errors surface through the iterator; keep a listener so they never go unhandled.
        request.removeListener("error", reject);
        request.on("error", () => undefined);
        resolve({
          status: message.statusCode ?? 0,
          header: (name) => {
            const value = message.headers[name.toLowerCase()];
            return Array.isArray(value) ? value[0] : value;
          },
          body: message,
          destroy: () => {
            message.destroy();
            request.destroy();
          }
        });
      });
      request.end();
    });
}

const nodeTransport = createNodeTransport();
