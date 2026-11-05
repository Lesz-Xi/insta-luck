import { CollectorError } from "./errors.js";
import type { NormalizedInstagramUrl } from "./types.js";

const SHORTCODE_PATTERN = /^[A-Za-z0-9_-]{5,32}$/;
const ALLOWED_HOSTS = new Set(["instagram.com", "www.instagram.com"]);

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

  const parts = parsed.pathname.split("/").filter(Boolean);
  const route = parts[0];
  const shortcode = parts[1];

  if (route !== "p" && route !== "reel") {
    throw new CollectorError("unsupported_route", "Only Instagram post and reel URLs are supported.");
  }

  if (typeof shortcode !== "string" || !SHORTCODE_PATTERN.test(shortcode)) {
    throw new CollectorError("invalid_shortcode", "Instagram shortcode is missing or malformed.");
  }

  const routeType = route === "p" ? "post" : "reel";
  return {
    inputUrl,
    canonicalUrl: `https://www.instagram.com/${route}/${shortcode}/`,
    shortcode,
    routeType
  };
}
