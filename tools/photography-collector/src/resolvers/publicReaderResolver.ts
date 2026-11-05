import { CollectorError } from "../errors.js";
import type { MediaCandidate, NormalizedInstagramUrl } from "../types.js";
import { classifyCandidates } from "./candidateClassifier.js";
import type { MediaResolver, RawMediaCandidate } from "./resolverTypes.js";

export type FetchText = (url: string) => Promise<string>;

const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;

async function defaultFetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 photography-collector/0.1" },
    signal: AbortSignal.timeout(30_000)
  });

  if (!response.ok) {
    throw new CollectorError("reader_fetch_failed", `Reader fetch failed with status ${response.status}.`);
  }

  return response.text();
}

export function buildReaderUrl(input: NormalizedInstagramUrl): string {
  return `https://r.jina.ai/http://${input.canonicalUrl}`;
}

export function extractMarkdownImageCandidates(markdown: string): readonly RawMediaCandidate[] {
  const candidates: RawMediaCandidate[] = [];
  let match: RegExpExecArray | null;

  while ((match = MARKDOWN_IMAGE_PATTERN.exec(markdown)) !== null) {
    const altText = match[1];
    const remoteUrl = match[2];
    if (typeof remoteUrl !== "string") continue;

    candidates.push({
      sourceName: "public_reader",
      remoteUrl,
      ...(altText === undefined ? {} : { altText }),
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
    const raw = extractMarkdownImageCandidates(markdown);
    return classifyCandidates(input, raw);
  }
}
