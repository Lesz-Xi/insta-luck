import { CollectorError } from "../../../tools/photography-collector/src/errors.js";
import { normalizeInstagramUrl } from "../../../tools/photography-collector/src/instagramUrl.js";
import type { LinkInput } from "./state.js";

export interface ParsedLinks {
  readonly accepted: readonly LinkInput[];
  /** What couldn't be used, with why, in the order it was pasted. */
  readonly rejected: readonly { readonly token: string; readonly code: string }[];
}

/** How a link is named on the sheet: short enough for a row, and still recognizably the link. */
export function linkLabel(routeType: "post" | "reel" | "profile", shortcode: string): string {
  if (routeType === "profile") return `@${shortcode}`;
  return routeType === "reel" ? `reel/${shortcode}` : `p/${shortcode}`;
}

function parseOne(token: string): LinkInput {
  const hasOurHost = /^(www\.|m\.)?(instagram\.com|instagr\.am)(\/|$)/i.test(token);
  const url = hasOurHost ? `https://${token}` : token.replace(/^http:\/\//i, "https://");
  const normalized = normalizeInstagramUrl(url);
  return { key: normalized.canonicalUrl, url, label: linkLabel(normalized.routeType, normalized.shortcode) };
}

/**
 * Accepts what people actually paste, one link or a list of them, then applies
 * the same rules as the server. Text that isn't a link is reported, never guessed at.
 */
export function parseLinks(raw: string): ParsedLinks {
  const accepted = new Map<string, LinkInput>();
  const rejected: { token: string; code: string }[] = [];

  for (const token of raw.split(/[\s,]+/).filter((part) => part.length > 0)) {
    try {
      const link = parseOne(token);
      if (!accepted.has(link.key)) accepted.set(link.key, link);
    } catch (error) {
      rejected.push({ token, code: error instanceof CollectorError ? error.code : "invalid_url" });
    }
  }
  return { accepted: [...accepted.values()], rejected };
}
