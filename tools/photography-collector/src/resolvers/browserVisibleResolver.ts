import type { MediaCandidate, NormalizedInstagramUrl } from "../types.js";
import { classifyCandidates } from "./candidateClassifier.js";
import type { MediaResolver, RawMediaCandidate } from "./resolverTypes.js";

export interface BrowserVisibleMediaExport {
  readonly pageUrl: string;
  readonly capturedAt: string;
  readonly images: readonly {
    readonly src: string;
    readonly srcset?: string;
    readonly alt?: string;
    readonly width?: number;
    readonly height?: number;
  }[];
  readonly videos: readonly {
    readonly src: string;
    readonly poster?: string;
    readonly width?: number;
    readonly height?: number;
  }[];
}

export class BrowserVisibleResolver implements MediaResolver {
  public readonly name = "browser_visible";
  private readonly browserExport: BrowserVisibleMediaExport | undefined;

  public constructor(browserExport?: BrowserVisibleMediaExport) {
    this.browserExport = browserExport;
  }

  public async resolve(input: NormalizedInstagramUrl): Promise<readonly MediaCandidate[]> {
    if (this.browserExport === undefined) return [];

    const imageCandidates: RawMediaCandidate[] = this.browserExport.images.map((image, index) => ({
      sourceName: "browser_visible",
      remoteUrl: pickLargestSrc(image.srcset) ?? image.src,
      ...(image.alt === undefined ? {} : { altText: image.alt }),
      ordinal: index + 1
    }));

    return classifyCandidates(input, imageCandidates).map((candidate) => ({
      ...candidate,
      source: "browser_visible"
    }));
  }
}

function pickLargestSrc(srcset: string | undefined): string | undefined {
  if (srcset === undefined) return undefined;
  const entries = srcset
    .split(",")
    .map((part) => part.trim())
    .map((part) => {
      const [url, descriptor] = part.split(/\s+/, 2);
      const width = descriptor?.endsWith("w") === true ? Number.parseInt(descriptor.slice(0, -1), 10) : 0;
      return url === undefined ? undefined : { url, width: Number.isFinite(width) ? width : 0 };
    })
    .filter((entry): entry is { readonly url: string; readonly width: number } => entry !== undefined);

  return entries.sort((a, b) => b.width - a.width)[0]?.url;
}
