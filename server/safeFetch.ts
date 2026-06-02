// SSRF-hardened fetch used for any server-side request whose URL
// originates from user input (e.g. agenda sync feeds in Task #210).
//
// Guarantees:
//  - Only http: and https: are permitted.
//  - The hostname is DNS-resolved and every returned address is
//    checked against a denylist of private, loopback, link-local,
//    multicast, broadcast, unspecified, carrier-grade NAT, and
//    IPv4-mapped/IPv6-translation ranges (IPv4 + IPv6).
//  - Redirects are followed manually so each hop's URL is re-
//    validated. Capped at MAX_REDIRECTS.
//  - Response body is capped at MAX_BYTES to prevent OOM on huge
//    feeds.
//  - A request budget (timeoutMs) bounds the whole flow.

import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";

const defaultLookup = (h: string) => dnsLookup(h, { all: true });

const MAX_REDIRECTS = 5;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

// IPv4 ranges we refuse to talk to from server-side fetch.
// Each entry is [networkAddressAsBigInt, prefixLength].
const V4_BLOCKED: Array<[string, number]> = [
  ["0.0.0.0", 8],          // "this" network / unspecified
  ["10.0.0.0", 8],         // RFC1918
  ["100.64.0.0", 10],      // CGNAT
  ["127.0.0.0", 8],        // loopback
  ["169.254.0.0", 16],     // link-local (incl. 169.254.169.254 cloud metadata)
  ["172.16.0.0", 12],      // RFC1918
  ["192.0.0.0", 24],       // IETF protocol assignments
  ["192.0.2.0", 24],       // TEST-NET-1
  ["192.168.0.0", 16],     // RFC1918
  ["198.18.0.0", 15],      // benchmarking
  ["198.51.100.0", 24],    // TEST-NET-2
  ["203.0.113.0", 24],     // TEST-NET-3
  ["224.0.0.0", 4],        // multicast
  ["240.0.0.0", 4],        // reserved (covers 255.255.255.255 broadcast)
];

function ipv4ToInt(addr: string): number {
  const parts = addr.split(".").map((p) => parseInt(p, 10));
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isV4InRange(ip: string, network: string, prefix: number): boolean {
  const ipN = ipv4ToInt(ip);
  const netN = ipv4ToInt(network);
  if (prefix === 0) return true;
  const mask = prefix === 32 ? 0xffffffff : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipN & mask) === (netN & mask);
}

function isBlockedV4(ip: string): boolean {
  for (const [net4, prefix] of V4_BLOCKED) {
    if (isV4InRange(ip, net4, prefix)) return true;
  }
  return false;
}

function normaliseV6(ip: string): string {
  // node returns canonical lowercase but some inputs may include
  // zone IDs (fe80::1%eth0) and embedded IPv4 (::ffff:1.2.3.4).
  return ip.toLowerCase().split("%")[0];
}

function isBlockedV6(raw: string): boolean {
  const ip = normaliseV6(raw);
  if (ip === "::" || ip === "::1") return true; // unspecified / loopback
  // Embedded IPv4: ::ffff:a.b.c.d  or  ::a.b.c.d
  const v4MappedMatch = ip.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (v4MappedMatch) return isBlockedV4(v4MappedMatch[1]);
  // 64:ff9b::/96 (NAT64), 2002::/16 (6to4), 2001::/32 (Teredo) →
  // these can tunnel to arbitrary v4 endpoints, refuse them.
  if (ip.startsWith("64:ff9b:")) return true;
  if (ip.startsWith("2002:")) return true;
  if (ip.startsWith("2001:0:") || ip.startsWith("2001::")) return true;
  const first = ip.split(":")[0];
  const head = parseInt(first || "0", 16);
  // fc00::/7  (unique local)
  if ((head & 0xfe00) === 0xfc00) return true;
  // fe80::/10 (link-local)
  if ((head & 0xffc0) === 0xfe80) return true;
  // ff00::/8  (multicast)
  if ((head & 0xff00) === 0xff00) return true;
  return false;
}

function assertSafeUrl(u: URL): void {
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new SsrfBlockedError(`Unsupported URL scheme: ${u.protocol}`);
  }
  // Strip userinfo — never honour credentials embedded in user URLs.
  if (u.username || u.password) {
    throw new SsrfBlockedError(`URLs with embedded credentials are not allowed`);
  }
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
  /** DNS-resolver override for tests. */
  lookupImpl?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
}

export interface SafeFetchResponse {
  status: number;
  statusText: string;
  text: string;
  /**
   * Raw response bytes. Needed for binary payloads (e.g. XLSX) where
   * the UTF-8 `text` decode would corrupt the content. Always populated
   * — it is the same buffer `text` is decoded from, so existing callers
   * that only read `text` are unaffected.
   */
  bytes: Uint8Array;
  finalUrl: string;
}

export async function safeFetch(
  rawUrl: string,
  opts: SafeFetchOptions = {},
): Promise<SafeFetchResponse> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const lookupFn = opts.lookupImpl ?? defaultLookup;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxBytes = opts.maxBytes ?? MAX_BYTES;

  let currentUrl: string;
  try {
    currentUrl = new URL(rawUrl).toString();
  } catch {
    throw new SsrfBlockedError(`Invalid URL: ${rawUrl}`);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const u = new URL(currentUrl);
      assertSafeUrl(u);
      // Strip IPv6 brackets — URL.hostname preserves them but
      // net.isIP / dns.lookup expect bare addresses.
      const bareHost = u.hostname.startsWith("[") && u.hostname.endsWith("]")
        ? u.hostname.slice(1, -1)
        : u.hostname;
      // Validate destination IPs before issuing the request.
      const family = net.isIP(bareHost);
      if (family === 4) {
        if (isBlockedV4(bareHost)) {
          throw new SsrfBlockedError(`Refusing to connect to private/reserved IPv4 ${bareHost}`);
        }
      } else if (family === 6) {
        if (isBlockedV6(bareHost)) {
          throw new SsrfBlockedError(`Refusing to connect to private/reserved IPv6 ${bareHost}`);
        }
      } else {
        const addrs = await lookupFn(bareHost);
        if (addrs.length === 0) {
          throw new SsrfBlockedError(`No addresses returned for ${bareHost}`);
        }
        for (const a of addrs) {
          if (a.family === 4 && isBlockedV4(a.address)) {
            throw new SsrfBlockedError(`Host ${bareHost} resolves to private/reserved IPv4 ${a.address}`);
          }
          if (a.family === 6 && isBlockedV6(a.address)) {
            throw new SsrfBlockedError(`Host ${bareHost} resolves to private/reserved IPv6 ${a.address}`);
          }
        }
      }

      const res = await fetchImpl(currentUrl, {
        signal: ctrl.signal,
        redirect: "manual",
        // Use a realistic browser User-Agent. Many hosts (Cloudflare,
        // Google, SharePoint, generic CDNs) reject unknown bot UAs with a
        // 403, so a non-browser UA was the most common cause of agenda
        // sources that load fine in a browser failing server-side.
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*;q=0.8",
        },
      });

      // Redirect? Re-validate the new URL on the next loop iteration.
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) {
          throw new SsrfBlockedError(`Redirect ${res.status} with no Location header`);
        }
        if (hop === MAX_REDIRECTS) {
          throw new SsrfBlockedError(`Too many redirects (>${MAX_REDIRECTS})`);
        }
        currentUrl = new URL(loc, currentUrl).toString();
        // Drain body to free the socket.
        try { await res.arrayBuffer(); } catch { /* ignore */ }
        continue;
      }

      // Read body with a hard size cap.
      const reader = res.body?.getReader();
      let received = 0;
      const chunks: Uint8Array[] = [];
      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            received += value.byteLength;
            if (received > maxBytes) {
              try { await reader.cancel(); } catch { /* ignore */ }
              throw new SsrfBlockedError(`Response exceeded ${maxBytes} byte cap`);
            }
            chunks.push(value);
          }
        }
      }
      // Concatenate.
      const buf = new Uint8Array(received);
      let off = 0;
      for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
      const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
      return {
        status: res.status,
        statusText: res.statusText,
        text,
        bytes: buf,
        finalUrl: currentUrl,
      };
    }
    throw new SsrfBlockedError(`Exhausted redirect budget`);
  } finally {
    clearTimeout(timer);
  }
}

// Re-export the IP helpers for unit tests.
export const __test__ = { isBlockedV4, isBlockedV6 };
