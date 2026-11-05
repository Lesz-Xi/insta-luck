export type SupportedImageMime = "image/jpeg" | "image/png" | "image/webp";

export interface VerifiedImage {
  readonly mimeType: SupportedImageMime;
  readonly extension: "jpeg" | "png" | "webp";
}

export function verifyImageBytes(bytes: Uint8Array): VerifiedImage | undefined {
  if (isJpeg(bytes)) return { mimeType: "image/jpeg", extension: "jpeg" };
  if (isPng(bytes)) return { mimeType: "image/png", extension: "png" };
  if (isWebp(bytes)) return { mimeType: "image/webp", extension: "webp" };
  return undefined;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  );
}
