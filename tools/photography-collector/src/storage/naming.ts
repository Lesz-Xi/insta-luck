import { extname } from "node:path";
import type { MediaCandidate } from "../types.js";

export function sanitizeFilenamePart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function filenameForCandidate(candidate: MediaCandidate, extension: string, manualName?: string): string {
  if (manualName !== undefined && manualName.trim().length > 0) {
    return ensureExtension(sanitizeFilenamePart(manualName), extension);
  }

  const date = candidate.postedAt === undefined ? undefined : sanitizeFilenamePart(candidate.postedAt);
  const shortcode = candidate.shortcode ?? "instagram";
  const kind = candidate.mediaKind;
  const index = candidate.carouselIndex === undefined ? undefined : String(candidate.carouselIndex);
  const base = ["instagram", shortcode, date, kind, index]
    .filter((value): value is string => value !== undefined && value.length > 0)
    .map(sanitizeFilenamePart)
    .join("-");

  return `${base}.${extension}`;
}

function ensureExtension(filename: string, extension: string): string {
  const wanted = `.${extension}`;
  if (extname(filename).toLowerCase() === wanted.toLowerCase()) return filename;
  return `${filename}${wanted}`;
}
