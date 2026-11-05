/**
 * Serves the site the way Vercel does: the same request handlers, the built
 * `dist` output with clean URLs, and the headers declared in vercel.json.
 *
 *   npm run start         built site with the real upstreams
 *   npm run dev           Vite with hot reload, real upstreams
 *   npm run dev:sample    Vite with scripted upstreams; no network
 *   --fixture             scripted upstreams against the built site (browser tests)
 */
import { existsSync, readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, resolve } from "node:path";
import { Readable } from "node:stream";
import { brotliCompressSync } from "node:zlib";
import type { Api } from "../hosted/handlers.js";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const flags = new Set(process.argv.slice(2));
const fixture = flags.has("--fixture");
const dev = flags.has("--dev");
const port = Number.parseInt(process.env.PORT ?? "4178", 10);

const envFile = resolve(root, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const fixtureApi = fixture ? (await import("../e2e/fixture-api.js")).createFixtureApi() : undefined;
const api: Api = fixtureApi ?? (await import("../hosted/production.js")).productionApi();

const MIME: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8"
};

interface VercelConfig {
  readonly headers: readonly { readonly headers: readonly { readonly key: string; readonly value: string }[] }[];
}

const vercel = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8")) as VercelConfig;
const declaredHeaders = vercel.headers.flatMap((rule) => rule.headers);

function applyDeclaredHeaders(response: ServerResponse): void {
  for (const { key, value } of declaredHeaders) response.setHeader(key, value);
}

function toRequest(request: IncomingMessage): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  return new Request(url, {
    method: request.method ?? "GET",
    headers,
    ...(hasBody ? { body: Readable.toWeb(request) as ReadableStream, duplex: "half" } : {})
  } as RequestInit);
}

async function send(target: ServerResponse, response: Response): Promise<void> {
  target.statusCode = response.status;
  response.headers.forEach((value, name) => {
    target.setHeader(name, value);
  });
  target.end(Buffer.from(await response.arrayBuffer()));
}

function routeApi(request: IncomingMessage): ((web: Request) => Response | Promise<Response>) | "method" | undefined {
  const { pathname } = new URL(request.url ?? "/", "http://localhost");
  const method = request.method ?? "GET";
  if (pathname === "/api/status") return method === "GET" ? (web) => api.status(web) : "method";
  if (pathname === "/api/resolve") return method === "POST" ? (web) => api.resolve(web) : "method";
  if (/^\/api\/media\/[^/]+$/.test(pathname)) return method === "GET" ? (web) => api.media(web) : "method";
  return undefined;
}

async function serveStatic(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const { pathname } = new URL(request.url ?? "/", "http://localhost");

  // Vercel's cleanUrls and trailingSlash: false.
  if (pathname.endsWith(".html") || (pathname.length > 1 && pathname.endsWith("/"))) {
    const clean = pathname.replace(/\.html$/, "").replace(/\/$/, "").replace(/\/index$/, "") || "/";
    response.writeHead(308, { location: clean });
    response.end();
    return;
  }

  const relative = pathname === "/" ? "index.html" : extname(pathname) === "" ? `${pathname.slice(1)}.html` : pathname.slice(1);
  const file = resolve(dist, relative);
  if (!file.startsWith(`${dist}/`) || !(await stat(file).catch(() => undefined))?.isFile()) {
    response.statusCode = 404;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end("Not found.");
    return;
  }

  const contents = await readFile(file);
  response.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");

  // Vercel compresses text at the edge; do the same, so local measurements are comparable.
  const textual = [".html", ".js", ".css", ".svg"].includes(extname(file));
  if (textual && String(request.headers["accept-encoding"] ?? "").includes("br")) {
    response.setHeader("content-encoding", "br");
    response.end(brotliCompressSync(contents));
    return;
  }
  response.end(contents);
}

const vite = dev
  ? await (await import("vite")).createServer({
      configFile: resolve(root, "vite.config.ts"),
      server: { middlewareMode: true }
    })
  : undefined;

const server = createServer((request, response) => {
  void (async () => {
    const { pathname, searchParams } = new URL(request.url ?? "/", "http://localhost");

    if (fixtureApi !== undefined && pathname.startsWith("/__fixture/")) {
      if (pathname === "/__fixture/advance") fixtureApi.advance(Number(searchParams.get("ms") ?? 0));
      if (pathname === "/__fixture/reset") fixtureApi.reset();
      response.end("ok");
      return;
    }

    if (pathname.startsWith("/api/")) {
      if (!dev) applyDeclaredHeaders(response);
      const handler = routeApi(request);
      if (handler === "method") {
        response.statusCode = 405;
        response.end();
        return;
      }
      if (handler === undefined) {
        response.statusCode = 404;
        response.end();
        return;
      }
      await send(response, await handler(toRequest(request)));
      return;
    }

    if (vite !== undefined) {
      vite.middlewares(request, response);
      return;
    }

    applyDeclaredHeaders(response);
    await serveStatic(request, response);
  })().catch((error: unknown) => {
    console.error(error);
    if (!response.headersSent) response.statusCode = 500;
    response.end();
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Insta Luck on http://127.0.0.1:${port}${fixture ? " (scripted upstreams)" : ""}`);
});
