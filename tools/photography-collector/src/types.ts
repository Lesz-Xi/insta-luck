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

/**
 * Why the classifier placed a candidate where it did. This is the evidence;
 * `mediaKind` and `confidence` are estimates drawn from it.
 */
export type CandidateBasis =
  | "first_dated_photo"
  | "same_date_as_first"
  | "photo_without_date"
  | "different_date"
  | "listed_under_more_posts"
  | "shown_on_profile"
  | "described_as_related"
  | "profile_picture"
  | "mentions_video"
  | "no_signal";

export type DownloadStatus =
  | { readonly type: "candidate" }
  | { readonly type: "downloaded"; readonly path: string; readonly sha256: string; readonly bytes: number }
  | { readonly type: "duplicate"; readonly existingPath: string; readonly sha256: string }
  | { readonly type: "failed"; readonly code: string; readonly message: string };

export interface NormalizedInstagramUrl {
  readonly inputUrl: string;
  readonly canonicalUrl: string;
  /** The post's shortcode, or the username for a profile. */
  readonly shortcode: string;
  readonly routeType: "post" | "reel" | "profile";
}

export interface MediaCandidate {
  readonly id: string;
  readonly source: MediaSource;
  readonly originalUrl: string;
  readonly shortcode?: string;
  readonly remoteUrl: string;
  readonly mediaKind: MediaKind;
  readonly basis: CandidateBasis;
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
