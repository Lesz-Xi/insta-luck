import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { CollectorError } from "../errors.js";

const ALLOWED_MEDIA_HOST_SUFFIXES = ["cdninstagram.com", "fbcdn.net"] as const;

const BLOCKED_ADDRESSES = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
] as const) {
  BLOCKED_ADDRESSES.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 96], // unspecified, loopback and IPv4-compatible
  ["64:ff9b::", 96], // NAT64 embeds an IPv4 target
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32], // Teredo embeds an IPv4 target
  ["2001:db8::", 32],
  ["2002::", 16], // 6to4 embeds an IPv4 target
  ["3fff::", 20],
  ["::ffff:0:0:0", 96], // IPv4-translated
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8]
] as const) {
  BLOCKED_ADDRESSES.addSubnet(network, prefix, "ipv6");
}

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

  if (url.port !== "" || url.username !== "" || url.password !== "") {
    throw new CollectorError("unsafe_url", "Media URL must not name a port or credentials.");
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
  const family = isIP(address);
  if (family === 0) return true;
  try {
    // BlockList checks IPv4-mapped IPv6 forms against the IPv4 rules, in any spelling.
    return BLOCKED_ADDRESSES.check(address, family === 4 ? "ipv4" : "ipv6");
  } catch {
    // A form Node can't evaluate, such as a zone-scoped address, is not provably public.
    return true;
  }
}
