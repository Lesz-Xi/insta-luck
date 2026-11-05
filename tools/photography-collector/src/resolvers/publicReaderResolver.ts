import { safeFetch } from "../download/safeFetch.js";
import { CollectorError } from "../errors.js";
import type { MediaCandidate, NormalizedInstagramUrl } from "../types.js";
import { classifyCandidates } from "./candidateClassifier.js";
import type { MediaResolver, RawMediaCandidate } from "./resolverTypes.js";

export type FetchText = (url: string) => Promise<string>;

/**
 * Alt text may hold balanced brackets but not stray ones. Neither part can
 * rescan what it already read, so matching stays linear on a hostile page,
 * and the URL's length is bounded.
 */
const MARKDOWN_IMAGE_PATTERN = /!\[((?:[^[\]]|\[[^[\]]*\])*)\]\((https?:\/\/[^\s()[\]]{1,2048})\)/g;
/** The boundary is a line of its own, as a heading or a link. A caption in a page title only mentions the words. */
const MORE_POSTS_PATTERN = /^\s*(?:#+\s*)?\[?more posts from\b/i;
/** The reader reports where it landed. A login page has nothing to offer and must not be read as content. */
const LOGIN_WALL_PATTERN = /^Final URL:\s*https:\/\/www\.instagram\.com\/accounts\/login/m;
const READER_HOSTS = ["r.jina.ai"] as const;
const READER_MAX_BYTES = 2 * 1024 * 1024;

async function defaultFetchText(url: string): Promise<string> {
  try {
    const { bytes } = await safeFetch(url, {
      allowedHostSuffixes: READER_HOSTS,
      maxBytes: READER_MAX_BYTES,
      timeoutMs: 30_000,
      headers: { "user-agent": "Mozilla/5.0 photography-collector/0.1" }
    });
    return new TextDecoder().decode(bytes);
  } catch (error) {
    if (error instanceof CollectorError && error.upstreamStatus !== undefined) {
      throw new CollectorError(
        "reader_fetch_failed",
        `Reader fetch failed with status ${error.upstreamStatus}.`,
        error.upstreamStatus
      );
    }
    throw error;
  }
}

/**
 * Jina Reader's documented form is the target URL appended to its origin.
 * A profile page redirects logged-out readers to a login, so a profile is read
 * from its public embed page: the surface Instagram serves to third-party sites,
 * with no login. It shows a few recent posts, not the whole account.
 */
export function buildReaderUrl(input: NormalizedInstagramUrl): string {
  const target = input.routeType === "profile" ? `${input.canonicalUrl}embed/` : input.canonicalUrl;
  return `https://r.jina.ai/${target}`;
}

/**
 * The offset of the "More posts from ..." line, if the page has one. Everything
 * after it is the account's other work, not this post.
 */
function findMorePostsBoundary(markdown: string): number | undefined {
  let offset = 0;
  for (const line of markdown.split("\n")) {
    if (!line.includes("![") && line.length <= 160 && MORE_POSTS_PATTERN.test(line)) return offset;
    offset += line.length + 1;
  }
  return undefined;
}

export function extractMarkdownImageCandidates(markdown: string): readonly RawMediaCandidate[] {
  const candidates: RawMediaCandidate[] = [];
  const boundary = findMorePostsBoundary(markdown);
  let match: RegExpExecArray | null;

  while ((match = MARKDOWN_IMAGE_PATTERN.exec(markdown)) !== null) {
    const altText = match[1];
    const remoteUrl = match[2];
    if (typeof remoteUrl !== "string") continue;

    candidates.push({
      sourceName: "public_reader",
      remoteUrl,
      ...(altText === undefined ? {} : { altText }),
      ...(boundary !== undefined && match.index > boundary ? { contextText: "more posts" } : {}),
      ordinal: candidates.length + 1
    });
  }

  return candidates;
}

export class PublicReaderResolver implements MediaResolver {
  public readonly name = "public_reader";
  private readonly fetchText: FetchText;

  public constructor(fetchText: FetchText = defaultFetchText) {
    this.fetchText = fetchText;
  }

  public async resolve(input: NormalizedInstagramUrl): Promise<readonly MediaCandidate[]> {
    const markdown = await this.fetchText(buildReaderUrl(input));
    if (LOGIN_WALL_PATTERN.test(markdown)) {
      throw new CollectorError("login_required", "Instagram asked for a login instead of showing this page.");
    }
    const raw = extractMarkdownImageCandidates(markdown);
    return classifyCandidates(input, raw);
  }
}
