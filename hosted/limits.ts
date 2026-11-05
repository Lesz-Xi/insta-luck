/**
 * Every hosted operation is bounded here, so the limits can be read in one place.
 * `imageBytes` sits below Vercel's 4.5 MB response limit, because an image is
 * validated whole before any of it is delivered.
 */
export const LIMITS = {
  jsonBodyBytes: 2 * 1024,
  refChars: 4 * 1024,
  readerBytes: 2 * 1024 * 1024,
  readerTimeoutMs: 20_000,
  imageBytes: 4 * 1024 * 1024,
  imageTimeoutMs: 12_000,
  maxRedirects: 3,
  maxFrames: 24,
  altTextChars: 280,
  postedAtChars: 32,
  /** Keeps every sealed reference under `refChars`. */
  remoteUrlChars: 2048,
  refTtlSeconds: 15 * 60,
  sessionMaxAgeSeconds: 60 * 60
} as const;
