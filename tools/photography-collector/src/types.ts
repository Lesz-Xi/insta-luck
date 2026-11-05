export type MediaSource =
  | "instagram_public_page"
  | "public_reader"
  | "browser_visible"
  | "instagram_official_api"
  | "manual";

export type MediaKind =
  | "post_image"
  | "post_video"
  | "carousel_item"
  | "profile_picture"
  | "related_post_thumbnail"
  | "unknown";

export type CandidateConfidence = "high" | "medium" | "low";

export type DownloadStatus =
  | { readonly type: "candidate" }
  | { readonly type: "downloaded"; readonly path: string; readonly sha256: string; readonly bytes: number }
  | { readonly type: "duplicate"; readonly existingPath: string; readonly sha256: string }
  | { readonly type: "failed"; readonly code: string; readonly message: string };

export interface NormalizedInstagramUrl {
  readonly inputUrl: string;
  readonly canonicalUrl: string;
  readonly shortcode: string;
  readonly routeType: "post" | "reel";
}

export interface MediaCandidate {
  readonly id: string;
  readonly source: MediaSource;
  readonly originalUrl: string;
  readonly shortcode?: string;
  readonly remoteUrl: string;
  readonly mediaKind: MediaKind;
  readonly carouselIndex?: number;
  readonly altText?: string;
  readonly caption?: string;
  readonly postedAt?: string;
  readonly width?: number;
  readonly height?: number;
  readonly confidence: CandidateConfidence;
  readonly status: DownloadStatus;
}

export interface CollectionLedgerEntry {
  readonly id: string;
  readonly originalUrl: string;
  readonly shortcode?: string;
  readonly source: MediaSource;
  readonly mediaKind: MediaKind;
  readonly localPath: string;
  readonly filename: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
  readonly caption?: string;
  readonly postedAt?: string;
  readonly savedAt: string;
}

export interface CollectionLedger {
  readonly schemaVersion: 1;
  readonly entries: readonly CollectionLedgerEntry[];
}

export interface DownloadResult {
  readonly candidate: MediaCandidate;
  readonly status: DownloadStatus;
  readonly mimeType?: string;
  readonly filename?: string;
}
