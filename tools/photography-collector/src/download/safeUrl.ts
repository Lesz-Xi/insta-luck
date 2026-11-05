import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { CollectorError } from "../errors.js";

const ALLOWED_MEDIA_HOST_SUFFIXES = ["cdninstagram.com", "fbcdn.net"] as const;

export interface SafeUrlOptions {
  readonly allowedHostSuffixes?: readonly string[];
  readonly resolveDns?: boolean;
}

export async function assertSafeMediaUrl(urlString: string, options: SafeUrlOptions = {}): Promise<URL> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new CollectorError("unsafe_url", "Media URL is malformed.");
  }

  if (url.protocol !== "https:") {
    throw new CollectorError("unsafe_scheme", "Media URL must use HTTPS.");
  }

  const allowedSuffixes = options.allowedHostSuffixes ?? ALLOWED_MEDIA_HOST_SUFFIXES;
  if (!isAllowedHost(url.hostname, allowedSuffixes)) {
    throw new CollectorError("unsafe_host", `Media host is not allowed: ${url.hostname}`);
  }

  if (options.resolveDns !== false) {
    await assertPublicDnsTarget(url.hostname);
  }

  return url;
}

export function isAllowedHost(hostname: string, allowedSuffixes: readonly string[] = ALLOWED_MEDIA_HOST_SUFFIXES): boolean {
  const host = hostname.toLowerCase();
  return allowedSuffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export async function assertPublicDnsTarget(hostname: string): Promise<void> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) {
    throw new CollectorError("dns_empty", `No DNS records for ${hostname}.`);
  }

  for (const record of records) {
    if (isPrivateAddress(record.address)) {
      throw new CollectorError("unsafe_dns_target", `Host resolves to a private/internal address: ${record.address}`);
    }
  }
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  if (a === undefined || b === undefined) return true;

  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 0) ||
    (a >= 224) ||
    address === "100.100.100.200"
  );
}

function isPrivateIpv6(address: string): boolean {
  const lower = address.toLowerCase();
  return (
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80") ||
    lower === "::" ||
    lower.startsWith("::ffff:127.") ||
    lower.startsWith("::ffff:10.") ||
    lower.startsWith("::ffff:192.168.")
  );
}
