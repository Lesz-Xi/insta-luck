import { CollectorError } from "./errors.js";
import type { NormalizedInstagramUrl } from "./types.js";

const SHORTCODE_PATTERN = /^[A-Za-z0-9_-]{5,32}$/;
const USERNAME_PATTERN = /^[A-Za-z0-9._]{1,30}$/;
const ALLOWED_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
  "instagr.am",
  "www.instagr.am"
]);

const POST_ROUTES: Readonly<Record<string, "post" | "reel">> = {
  p: "post",
  tv: "post",
  reel: "reel",
  reels: "reel"
};

/** First path segments that belong to Instagram rather than to an account. */
const RESERVED_SEGMENTS = new Set([
  "about",
  "accounts",
  "ads",
  "api",
  "challenge",
  "developer",
  "direct",
  "directory",
  "emails",
  "explore",
  "graphql",
  "legal",
  "nametag",
  "oauth",
  "popular",
  "press",
  "privacy",
  "reels",
  "session",
  "stories",
  "terms",
  "web"
]);

function postUrl(inputUrl: string, route: string, code: string | undefined): NormalizedInstagramUrl {
  if (code === undefined || !SHORTCODE_PATTERN.test(code)) {
    throw new CollectorError("invalid_shortcode", "Instagram shortcode is missing or malformed.");
  }

  const routeType = POST_ROUTES[route] ?? "post";
  return {
    inputUrl,
    canonicalUrl: `https://www.instagram.com/${routeType === "reel" ? "reel" : "p"}/${code}/`,
    shortcode: code,
    routeType
  };
}

function profileUrl(inputUrl: string, segment: string | undefined): NormalizedInstagramUrl {
  if (segment === undefined || RESERVED_SEGMENTS.has(segment.toLowerCase()) || !USERNAME_PATTERN.test(segment)) {
    throw new CollectorError("unsupported_route", "Only Instagram post, Reel and profile URLs are supported.");
  }

  const username = segment.toLowerCase();
  return {
    inputUrl,
    canonicalUrl: `https://www.instagram.com/${username}/`,
    shortcode: username,
    routeType: "profile"
  };
}

export function normalizeInstagramUrl(inputUrl: string): NormalizedInstagramUrl {
  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch {
    throw new CollectorError("invalid_url", `Invalid URL: ${inputUrl}`);
  }

  if (parsed.protocol !== "https:") {
    throw new CollectorError("invalid_scheme", "Instagram URL must use HTTPS.");
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    throw new CollectorError("invalid_host", `Unsupported Instagram host: ${parsed.hostname}`);
  }

  const [first, second, third] = parsed.pathname.split("/").filter(Boolean);

  // /reels/ alone is Instagram's own feed, not a Reel.
  if (first !== undefined && first in POST_ROUTES && (first !== "reels" || second !== undefined)) {
    return postUrl(inputUrl, first, second);
  }

  // Shared links often carry the account: /<user>/p/<code>/ or /<user>/reel/<code>/.
  if (second !== undefined && second in POST_ROUTES && third !== undefined) {
    return postUrl(inputUrl, second, third);
  }

  return profileUrl(inputUrl, first === "_u" ? second : first);
}
