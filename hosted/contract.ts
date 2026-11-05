import type { CandidateBasis } from "../tools/photography-collector/src/types.js";

export type { CandidateBasis };

/** "post" is an estimate, never a guarantee of carousel membership. */
export type FrameGroup = "post" | "nearby";

export interface ClientFrame {
  /** Stable across resolves of the same post, so a selection can survive re-resolution. */
  readonly id: string;
  /** Opaque, encrypted, expiring and bound to this browser's session. */
  readonly ref: string;
  readonly number: number;
  readonly group: FrameGroup;
  readonly basis: CandidateBasis;
  /** The frame a date comparison was made against. */
  readonly anchorNumber?: number;
  readonly altText?: string;
  readonly postedAt?: string;
}

export interface ResolveResponse {
  readonly source: {
    readonly canonicalUrl: string;
    readonly shortcode: string;
    readonly routeType: "post" | "reel" | "profile";
  };
  readonly frames: readonly ClientFrame[];
  /** Images found but not shown, because they weren't safe to fetch or were over the frame limit. */
  readonly omitted: number;
  /** A duration, because a visitor's clock can't be trusted to agree with the server's. */
  readonly expiresInMs: number;
}

export interface StatusResponse {
  readonly open: boolean;
}

export type ProblemCode =
  | "closed"
  | "invalid_request"
  | "payload_too_large"
  | "wrong_origin"
  | "invalid_link"
  | "unsupported_link"
  | "login_required"
  | "reader_limited"
  | "reader_timeout"
  | "reader_unavailable"
  | "ref_invalid"
  | "ref_expired"
  | "source_gone"
  | "source_limited"
  | "source_blocked"
  | "source_timeout"
  | "source_unavailable"
  | "image_too_large"
  | "not_an_image"
  | "internal";

export interface ProblemBody {
  readonly error: {
    readonly code: ProblemCode;
    readonly message: string;
    readonly retryable: boolean;
    readonly retryAfterSeconds?: number;
  };
}
