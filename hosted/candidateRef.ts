import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { LIMITS } from "./limits.js";

const IV_BYTES = 12;
const TAG_BYTES = 16;
const CONTEXT = "insta-luck:candidate-ref:v1:";

export interface CandidateClaims {
  readonly url: string;
  readonly shortcode: string;
  readonly number: number;
  readonly expiresAt: number;
}

export type OpenResult =
  | { readonly ok: true; readonly claims: CandidateClaims }
  | { readonly ok: false; readonly reason: "invalid" | "expired" };

export function deriveKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "insta-luck", "candidate-ref:v1", 32));
}

/**
 * Seals a candidate into an opaque reference. Encryption, not signing, because
 * the claims hold a signed CDN URL that must not reach the browser. The session
 * is authenticated data, so a reference opens only for the session it was issued to.
 */
export function sealRef(claims: CandidateClaims, sessionId: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(CONTEXT + sessionId));
  const sealed = Buffer.concat([cipher.update(JSON.stringify(claims), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString("base64url");
}

export function openRef(ref: string, sessionId: string, key: Buffer, now: number): OpenResult {
  if (ref.length === 0 || ref.length > LIMITS.refChars) return { ok: false, reason: "invalid" };

  const raw = Buffer.from(ref, "base64url");
  if (raw.byteLength <= IV_BYTES + TAG_BYTES) return { ok: false, reason: "invalid" };

  let claims: unknown;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, IV_BYTES), { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(CONTEXT + sessionId));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const plain = Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
    claims = JSON.parse(plain.toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (!isClaims(claims)) return { ok: false, reason: "invalid" };
  if (claims.expiresAt <= now) return { ok: false, reason: "expired" };
  return { ok: true, claims };
}

function isClaims(value: unknown): value is CandidateClaims {
  if (typeof value !== "object" || value === null) return false;
  const claims = value as Record<string, unknown>;
  return (
    typeof claims.url === "string" &&
    typeof claims.shortcode === "string" &&
    typeof claims.number === "number" &&
    typeof claims.expiresAt === "number"
  );
}
