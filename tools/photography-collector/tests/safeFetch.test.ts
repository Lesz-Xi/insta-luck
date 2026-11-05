import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  createNodeTransport,
  guardedLookup,
  safeFetch,
  type Transport,
  type TransportResponse
} from "../src/download/safeFetch.js";

const CDN = "https://scontent.cdninstagram.com/a.jpg";

function respond(
  status: number,
  options: { headers?: Record<string, string>; chunks?: readonly Uint8Array[]; onRead?: (index: number) => void } = {}
): TransportResponse & { destroyed: () => boolean } {
  let destroyed = false;
  const chunks = options.chunks ?? [];
  return {
    status,
    header: (name) => options.headers?.[name],
    body: (async function* body() {
      for (const [index, chunk] of chunks.entries()) {
        options.onRead?.(index);
        yield chunk;
      }
    })(),
    destroy: () => {
      destroyed = true;
    },
    destroyed: () => destroyed
  };
}

function sequence(...responses: readonly TransportResponse[]): Transport & { requested: string[] } {
  const requested: string[] = [];
  let index = 0;
  const transport = (async (url: URL) => {
    requested.push(url.toString());
    const next = responses[index];
    index += 1;
    if (next === undefined) throw new Error("unexpected extra request");
    return next;
  }) as Transport & { requested: string[] };
  transport.requested = requested;
  return transport;
}

const base = { maxBytes: 1024, timeoutMs: 1000 };

describe("safeFetch", () => {
  it("returns the body of a direct response", async () => {
    const transport = sequence(respond(200, { chunks: [new Uint8Array([1, 2]), new Uint8Array([3])] }));
    const { bytes } = await safeFetch(CDN, { ...base, transport });
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  it("follows a redirect only after checking the destination", async () => {
    const next = "https://scontent-2.fbcdn.net/b.jpg";
    const transport = sequence(
      respond(302, { headers: { location: next } }),
      respond(200, { chunks: [new Uint8Array([9])] })
    );
    const { finalUrl } = await safeFetch(CDN, { ...base, transport });
    expect(finalUrl.toString()).toBe(next);
    expect(transport.requested).toEqual([CDN, next]);
  });

  it.each([
    ["another host", "https://example.com/a.jpg", /not allowed/],
    ["a metadata address", "https://169.254.169.254/latest/meta-data/", /not allowed/],
    ["plain HTTP", "http://scontent.cdninstagram.com/a.jpg", /HTTPS/]
  ])("refuses a redirect to %s without requesting it", async (_name, location, message) => {
    const transport = sequence(respond(302, { headers: { location } }));
    await expect(safeFetch(CDN, { ...base, transport })).rejects.toThrow(message);
    expect(transport.requested).toEqual([CDN]);
  });

  it("stops after the redirect limit", async () => {
    const hop = () => respond(302, { headers: { location: CDN } });
    await expect(safeFetch(CDN, { ...base, maxRedirects: 2, transport: sequence(hop(), hop(), hop()) })).rejects.toMatchObject({
      code: "too_many_redirects"
    });
  });

  it("rejects a redirect with no location", async () => {
    await expect(safeFetch(CDN, { ...base, transport: sequence(respond(301)) })).rejects.toMatchObject({
      code: "redirect_missing_location"
    });
  });

  it("refuses a declared oversize without reading the body", async () => {
    let read = false;
    const response = respond(200, {
      headers: { "content-length": "4096" },
      chunks: [new Uint8Array(1)],
      onRead: () => {
        read = true;
      }
    });
    await expect(safeFetch(CDN, { ...base, transport: sequence(response) })).rejects.toMatchObject({ code: "file_too_large" });
    expect(read).toBe(false);
    expect(response.destroyed()).toBe(true);
  });

  it("stops reading an undeclared body as soon as it passes the limit", async () => {
    const seen: number[] = [];
    const response = respond(200, {
      chunks: [new Uint8Array(600), new Uint8Array(600), new Uint8Array(600)],
      onRead: (index) => seen.push(index)
    });
    await expect(safeFetch(CDN, { ...base, transport: sequence(response) })).rejects.toMatchObject({ code: "file_too_large" });
    expect(seen).toEqual([0, 1]);
    expect(response.destroyed()).toBe(true);
  });

  it("keeps the upstream status on failure", async () => {
    await expect(safeFetch(CDN, { ...base, transport: sequence(respond(403)) })).rejects.toMatchObject({
      code: "download_failed",
      upstreamStatus: 403
    });
  });

  it("names a timeout", async () => {
    const hang: Transport = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason));
      });
    await expect(safeFetch(CDN, { maxBytes: 10, timeoutMs: 20, transport: hang })).rejects.toMatchObject({
      code: "upstream_timeout"
    });
  });

  it("honours a caller's cancellation", async () => {
    const controller = new AbortController();
    const hang: Transport = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason));
      });
    const pending = safeFetch(CDN, { maxBytes: 10, timeoutMs: 1000, transport: hang, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "aborted" });
  });
});

describe("guardedLookup", () => {
  const fakeDns = (addresses: readonly { address: string; family: number }[]) =>
    ((_host: string, _options: unknown, done: (error: null, records: typeof addresses) => void) => {
      done(null, addresses);
    }) as never;

  function run(addresses: readonly { address: string; family: number }[], all: boolean) {
    return new Promise<{ error: unknown; value: unknown; family: unknown }>((resolve) => {
      guardedLookup(
        "cdn.example",
        all ? { all: true } : {},
        (error, value, family) => resolve({ error, value, family }),
        fakeDns(addresses)
      );
    });
  }

  it("passes public addresses through in the shape the caller asked for", async () => {
    const records = [{ address: "157.240.1.174", family: 4 }];
    expect(await run(records, false)).toMatchObject({ error: null, value: "157.240.1.174", family: 4 });
    expect(await run(records, true)).toMatchObject({ error: null, value: records });
  });

  it("refuses a host when any address is private, including mapped forms", async () => {
    const mixed = [
      { address: "157.240.1.174", family: 4 },
      { address: "::ffff:10.0.0.1", family: 6 }
    ];
    expect((await run(mixed, true)).error).toMatchObject({ code: "unsafe_dns_target" });
  });

  it("refuses an empty answer", async () => {
    expect((await run([], false)).error).toMatchObject({ code: "dns_empty" });
  });
});

describe("node transport", () => {
  let server: Server | undefined;
  afterEach(() => {
    server?.closeAllConnections();
    server?.close();
  });

  it("abandons a real chunked response mid-stream at the byte limit", async () => {
    let bytesWritten = 0;
    let clientClosed = false;
    const started = new Promise<void>((ready) => {
      server = createServer((_request, response) => {
        response.writeHead(200, { "content-type": "image/jpeg" });
        const timer = setInterval(() => {
          bytesWritten += 64 * 1024;
          response.write(Buffer.alloc(64 * 1024));
        }, 1);
        response.on("close", () => {
          clientClosed = true;
          clearInterval(timer);
        });
      }).listen(0, "127.0.0.1", ready);
    });
    await started;
    const { port } = server?.address() as AddressInfo;
    const real = createNodeTransport({ request: (url, options) => httpRequest(url, options) });

    await expect(
      safeFetch(CDN, {
        maxBytes: 256 * 1024,
        timeoutMs: 5000,
        resolveDns: false,
        transport: (_url, init) => real(new URL(`http://127.0.0.1:${port}/`), init)
      })
    ).rejects.toMatchObject({ code: "file_too_large" });

    await expect.poll(() => clientClosed).toBe(true);
    expect(bytesWritten).toBeLessThan(16 * 1024 * 1024);
  });

  it("applies the guarded lookup to a real connection", async () => {
    const real = createNodeTransport({ request: (url, options) => httpRequest(url, options) });
    await expect(
      safeFetch(CDN, {
        maxBytes: 1024,
        timeoutMs: 2000,
        transport: (_url, init) => real(new URL("http://localhost:1/"), init)
      })
    ).rejects.toMatchObject({ code: "unsafe_dns_target" });
  });
});
