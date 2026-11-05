import type { ProblemBody, ProblemCode } from "./contract.js";

interface ProblemSpec {
  readonly status: number;
  readonly message: string;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
}

/**
 * The only messages a visitor can receive. They are fixed strings, so an
 * upstream URL, server path or stack trace has no route into a response.
 */
const PROBLEMS: Record<ProblemCode, ProblemSpec> = {
  closed: { status: 503, message: "Insta Luck isn’t open here right now.", retryable: false },
  invalid_request: { status: 400, message: "That request wasn’t understood.", retryable: false },
  payload_too_large: { status: 413, message: "That request is too large.", retryable: false },
  wrong_origin: { status: 403, message: "That request came from another site.", retryable: false },
  invalid_link: {
    status: 400,
    message: "That isn’t a valid Instagram link.",
    retryable: false
  },
  unsupported_link: {
    status: 400,
    message: "Only Instagram post, Reel and profile links work here.",
    retryable: false
  },
  login_required: {
    status: 502,
    message: "Instagram asked for a login instead of showing this page. Private accounts can’t be read here; a public one may work if you try again.",
    retryable: true
  },
  reader_limited: {
    status: 503,
    message: "The public reader is limiting requests right now. Try again in a minute.",
    retryable: true,
    retryAfterSeconds: 60
  },
  reader_timeout: { status: 504, message: "The public reader took too long to answer. Try again.", retryable: true },
  reader_unavailable: { status: 502, message: "The public reader couldn’t read this link. Try again.", retryable: true },
  ref_invalid: {
    status: 403,
    message: "This link belongs to another browser session. Read it again.",
    retryable: false
  },
  ref_expired: { status: 410, message: "This link has expired. Read it again to continue.", retryable: false },
  source_gone: {
    status: 502,
    message: "Instagram’s image server no longer offers this file. Read the link again.",
    retryable: false
  },
  source_limited: {
    status: 503,
    message: "Instagram’s image server is limiting requests. Try again in a minute.",
    retryable: true,
    retryAfterSeconds: 60
  },
  source_blocked: { status: 422, message: "This image’s address isn’t one we can safely fetch.", retryable: false },
  source_timeout: { status: 504, message: "The image took too long to arrive. Try again.", retryable: true },
  source_unavailable: { status: 502, message: "The image couldn’t be fetched. Try again.", retryable: true },
  image_too_large: { status: 413, message: "This image is larger than the hosted limit of 4 MB.", retryable: false },
  not_an_image: { status: 415, message: "This file isn’t a JPEG, PNG or WebP image.", retryable: false },
  internal: { status: 500, message: "Something went wrong on our side. Try again.", retryable: true }
};

export function problem(code: ProblemCode): Response {
  const spec = PROBLEMS[code];
  const body: ProblemBody = {
    error: {
      code,
      message: spec.message,
      retryable: spec.retryable,
      ...(spec.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: spec.retryAfterSeconds })
    }
  };

  return Response.json(body, {
    status: spec.status,
    headers: {
      "cache-control": "no-store",
      ...(spec.retryAfterSeconds === undefined ? {} : { "retry-after": String(spec.retryAfterSeconds) })
    }
  });
}
