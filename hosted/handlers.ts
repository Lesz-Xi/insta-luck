import { CollectorError } from "../tools/photography-collector/src/errors.js";
import { normalizeInstagramUrl } from "../tools/photography-collector/src/instagramUrl.js";
import { verifyImageBytes, type VerifiedImage } from "../tools/photography-collector/src/download/verifyImage.js";
import type { MediaCandidate, NormalizedInstagramUrl } from "../tools/photography-collector/src/types.js";
import { deriveKey, openRef, sealRef, type CandidateClaims } from "./candidateRef.js";
import type { ClientFrame, ProblemCode, ResolveResponse, StatusResponse } from "./contract.js";
import { layOutSheet } from "./frames.js";
import { LIMITS } from "./limits.js";
import { problem } from "./problem.js";
import { mintSession, readSession, sessionCookie } from "./session.js";

const MIN_SECRET_CHARS = 32;

export interface ApiDeps {
  /** The admission gate. Hosted operation stays off until it is explicitly opened. */
  readonly open: boolean;
  readonly secret: string | undefined;
  /** Both receive the request's signal, so upstream work stops when the visitor leaves. */
  readonly readPost: (input: NormalizedInstagramUrl, signal: AbortSignal) => Promise<readonly MediaCandidate[]>;
  readonly fetchImage: (remoteUrl: string, signal: AbortSignal) => Promise<Uint8Array>;
  readonly now?: () => number;
}

export interface Api {
  status(request: Request): Response;
  resolve(request: Request): Promise<Response>;
  media(request: Request): Promise<Response>;
}

/**
 * The hosted operation as plain request-to-response functions. Nothing is held
 * between calls: a candidate travels inside its sealed reference, so preview and
 * download work on any instance that shares the secret.
 */
export function createApi(deps: ApiDeps): Api {
  const now = deps.now ?? Date.now;
  const key = deps.secret !== undefined && deps.secret.length >= MIN_SECRET_CHARS ? deriveKey(deps.secret) : undefined;
  const liveKey = deps.open ? key : undefined;

  return {
    status(request) {
      const body: StatusResponse = { open: liveKey !== undefined };
      // Issued at page load, so two tabs opened together share a session instead of racing to set one.
      const issue = liveKey !== undefined && readSession(request) === undefined;
      return Response.json(body, {
        headers: {
          "cache-control": "no-store",
          ...(issue ? { "set-cookie": sessionCookie(mintSession(), isSecureHost(request)) } : {})
        }
      });
    },

    async resolve(request) {
      if (liveKey === undefined) return problem("closed");
      if (!isSameOrigin(request)) return problem("wrong_origin");

      const body = await readJson(request);
      if (!body.ok) return problem(body.code);
      if (!hasUrl(body.value)) return problem("invalid_request");

      let input: NormalizedInstagramUrl;
      try {
        input = normalizeInstagramUrl(body.value.url);
      } catch (error) {
        return problem(linkProblem(error));
      }

      let candidates: readonly MediaCandidate[];
      try {
        candidates = await deps.readPost(input, request.signal);
      } catch (error) {
        return problem(logged("resolve", error, readerProblem(error)));
      }

      const sessionId = readSession(request) ?? mintSession();
      const expiresInMs = LIMITS.refTtlSeconds * 1000;
      const expiresAt = now() + expiresInMs;
      const { drafts, omitted } = layOutSheet(input, candidates);
      const frames = drafts.map(({ remoteUrl, ...frame }): ClientFrame => {
        const claims: CandidateClaims = { url: remoteUrl, shortcode: input.shortcode, number: frame.number, expiresAt };
        return { ...frame, ref: sealRef(claims, sessionId, liveKey) };
      });

      const response: ResolveResponse = {
        source: { canonicalUrl: input.canonicalUrl, shortcode: input.shortcode, routeType: input.routeType },
        frames,
        omitted,
        expiresInMs
      };

      return Response.json(response, {
        headers: {
          "cache-control": "no-store",
          "set-cookie": sessionCookie(sessionId, isSecureHost(request))
        }
      });
    },

    async media(request) {
      if (liveKey === undefined) return problem("closed");

      const url = new URL(request.url);
      // Vercel routes /api/media/:ref with the segment as a query parameter.
      const ref = url.searchParams.get("ref") ?? url.pathname.split("/").pop() ?? "";
      const sessionId = readSession(request);
      if (sessionId === undefined) return problem("ref_invalid");

      const opened = openRef(ref, sessionId, liveKey, now());
      if (!opened.ok) return problem(opened.reason === "expired" ? "ref_expired" : "ref_invalid");

      let bytes: Uint8Array;
      try {
        bytes = await deps.fetchImage(opened.claims.url, request.signal);
      } catch (error) {
        return problem(logged("media", error, sourceProblem(error)));
      }

      const image = verifyImageBytes(bytes);
      if (image === undefined) return problem("not_an_image");

      return imageResponse(bytes, image, opened.claims, url.searchParams.get("download") === "1");
    }
  };
}

function imageResponse(bytes: Uint8Array, image: VerifiedImage, claims: CandidateClaims, download: boolean): Response {
  const extension = image.extension === "jpeg" ? "jpg" : image.extension;
  const number = String(claims.number).padStart(2, "0");
  const filename = `insta-luck-${claims.shortcode}-${number}.${extension}`;

  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": image.mimeType,
      "content-length": String(bytes.byteLength),
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "cache-control": "private, max-age=300",
      vary: "cookie",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox"
    }
  });
}

/** Secure everywhere except loopback, rather than trusting the scheme a proxy reports. */
function isSecureHost(request: Request): boolean {
  return !["localhost", "127.0.0.1"].includes(new URL(request.url).hostname);
}

function isSameOrigin(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin") return false;

  const origin = request.headers.get("origin");
  if (origin === null) return true;

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

type JsonResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly code: ProblemCode };

/** Reads JSON up to the body limit, whatever the request declares about its length. */
async function readJson(request: Request): Promise<JsonResult> {
  const declared = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > LIMITS.jsonBodyBytes) return { ok: false, code: "payload_too_large" };
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return { ok: false, code: "invalid_request" };
  }
  if (request.body === null) return { ok: false, code: "invalid_request" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > LIMITS.jsonBodyBytes) {
      await reader.cancel();
      return { ok: false, code: "payload_too_large" };
    }
    chunks.push(value);
  }

  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { ok: false, code: "invalid_request" };
  }
}

function hasUrl(value: unknown): value is { readonly url: string } {
  return typeof value === "object" && value !== null && typeof (value as { url?: unknown }).url === "string";
}

function linkProblem(error: unknown): ProblemCode {
  return error instanceof CollectorError && error.code === "unsupported_route" ? "unsupported_link" : "invalid_link";
}

function readerProblem(error: unknown): ProblemCode {
  if (!(error instanceof CollectorError)) return "reader_unavailable";
  if (error.code === "login_required") return "login_required";
  if (error.code === "upstream_timeout") return "reader_timeout";
  if (error.upstreamStatus === 429) return "reader_limited";
  return "reader_unavailable";
}

function sourceProblem(error: unknown): ProblemCode {
  if (!(error instanceof CollectorError)) return "source_unavailable";
  if (error.code === "file_too_large") return "image_too_large";
  if (error.code === "upstream_timeout") return "source_timeout";
  if (["unsafe_host", "unsafe_scheme", "unsafe_url", "unsafe_dns_target", "dns_empty"].includes(error.code)) {
    return "source_blocked";
  }
  if (error.upstreamStatus === 429) return "source_limited";
  if ([401, 403, 404, 410].includes(error.upstreamStatus ?? 0)) return "source_gone";
  return "source_unavailable";
}

/** Logs the classification only: never a URL, which may carry a CDN signature. */
function logged(route: string, error: unknown, code: ProblemCode): ProblemCode {
  const cause = error instanceof CollectorError ? error.code : "unexpected";
  console.error(JSON.stringify({ route, code, cause }));
  return code;
}
