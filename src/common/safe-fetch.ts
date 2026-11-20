import { lookup as dnsLookup } from 'node:dns/promises';
import type { IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';

/**
 * SSRF-safe fetcher for staff-entered and imported URLs (PLAN §9 "Uploads", DECISIONS D-026).
 *
 * - https only, default port only (443), no credentials in the URL.
 * - The host is resolved first and EVERY address must be public. The connection is then pinned to the
 *   checked address, so a DNS answer cannot change between the check and the connect (rebinding).
 * - Redirects are followed by hand (at most 3) and every hop is checked again.
 * - Response size and total time are capped.
 *
 * It never logs URLs or bodies; callers decide what to record.
 */

export class SafeFetchError extends Error {
  constructor(
    readonly code: 'BAD_URL' | 'BLOCKED_ADDRESS' | 'TOO_MANY_REDIRECTS' | 'TOO_LARGE' | 'TIMEOUT' | 'NETWORK',
    message: string,
  ) {
    super(message);
  }
}

export interface SafeResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
  finalUrl: string;
}

export interface SafeFetchOptions {
  method?: 'GET' | 'HEAD';
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  accept?: string;
  /** Stop reading at maxBytes and return what arrived, instead of failing (status checks only). */
  truncate?: boolean;
}

/** One HTTP exchange against an already-checked address. Replaceable in tests. */
export type Transport = (
  url: URL,
  address: string,
  family: 4 | 6,
  opts: Required<Pick<SafeFetchOptions, 'method' | 'maxBytes' | 'accept' | 'truncate'>> & { signal: AbortSignal },
) => Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }>;

export type Resolver = (host: string) => Promise<Array<{ address: string; family: number }>>;

export interface SafeFetchDeps {
  resolve?: Resolver;
  transport?: Transport;
}

/**
 * Sites such as Wikimedia ask automated clients to give contact details in the User-Agent. FETCH_CONTACT
 * (a URL or address the operator chooses, see .env.example) is appended when set; nothing personal is added by default.
 */
const contact = process.env.FETCH_CONTACT?.replace(/[^\x20-\x7e]/g, '').slice(0, 200).trim();
export const USER_AGENT = `WildwardBot/0.1 (catalogue link and media checker${contact ? `; ${contact}` : ''})`;

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 96], ['::1', 128], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001::', 32], ['2001:db8::', 32],
  ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) blocked.addSubnet(net, prefix, 'ipv6');

/** IPv4-mapped IPv6 (::ffff:a.b.c.d or ::ffff:7f00:1, as the URL parser and DNS return them) → the IPv4 address. */
function mappedIpv4(addr: string): string | null {
  const a = addr.toLowerCase();
  if (!a.startsWith('::ffff:')) return null;
  const tail = a.slice(7);
  if (isIP(tail) === 4) return tail;
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(tail);
  if (!hex) return null;
  const hi = parseInt(hex[1], 16);
  const lo = parseInt(hex[2], 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

/** True when an address is loopback, private, link-local, unique-local, multicast, reserved or documentation. */
export function isBlockedAddress(addr: string): boolean {
  const fam = isIP(addr);
  if (fam === 4) return blocked.check(addr, 'ipv4');
  if (fam === 6) {
    const v4 = mappedIpv4(addr);
    if (v4) return blocked.check(v4, 'ipv4');
    return blocked.check(addr, 'ipv6');
  }
  return true;
}

/** Parses and checks the shape of a URL before anything is resolved. */
export function checkUrlShape(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SafeFetchError('BAD_URL', 'Not a valid URL');
  }
  if (u.protocol !== 'https:') throw new SafeFetchError('BAD_URL', 'Only https URLs are fetched');
  if (u.username || u.password) throw new SafeFetchError('BAD_URL', 'URLs with credentials are not fetched');
  if (u.port && u.port !== '443') throw new SafeFetchError('BAD_URL', 'Only the default https port is fetched');
  if (!u.hostname) throw new SafeFetchError('BAD_URL', 'URL has no host');
  return u;
}

const defaultResolve: Resolver = (host) => dnsLookup(host, { all: true, verbatim: true });

const defaultTransport: Transport = (url, address, family, opts) =>
  new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        host: url.hostname,
        servername: isIP(url.hostname) ? undefined : url.hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: opts.method,
        headers: { 'user-agent': USER_AGENT, accept: opts.accept },
        signal: opts.signal,
        // Pin the connection to the address that was checked.
        lookup: (_h, o, cb) => {
          if ((o as { all?: boolean }).all) (cb as unknown as (e: null, a: Array<{ address: string; family: number }>) => void)(null, [{ address, family }]);
          else cb(null, address, family);
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > opts.maxBytes) {
            if (opts.truncate) {
              resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) });
              req.destroy();
            } else req.destroy(new SafeFetchError('TOO_LARGE', 'Response is larger than allowed'));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end();
  });

export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}, deps: SafeFetchDeps = {}): Promise<SafeResponse> {
  const method = options.method ?? 'GET';
  const maxBytes = options.maxBytes ?? 5_000_000;
  const maxRedirects = options.maxRedirects ?? 3;
  const accept = options.accept ?? '*/*';
  const truncate = options.truncate ?? false;
  const resolve = deps.resolve ?? defaultResolve;
  const transport = deps.transport ?? defaultTransport;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  try {
    let url = checkUrlShape(rawUrl);
    for (let hop = 0; ; hop++) {
      const host = url.hostname.replace(/^\[|\]$/g, '');
      const addrs = isIP(host) ? [{ address: host, family: isIP(host) }] : await resolve(host);
      if (!addrs.length || addrs.some((a) => isBlockedAddress(a.address))) {
        throw new SafeFetchError('BLOCKED_ADDRESS', 'The host resolves to a private or reserved address');
      }
      const pick = addrs[0];
      let res;
      try {
        res = await transport(url, pick.address, pick.family === 6 ? 6 : 4, { method, maxBytes, accept, truncate, signal: controller.signal });
      } catch (e) {
        if (e instanceof SafeFetchError) throw e;
        if (controller.signal.aborted) throw new SafeFetchError('TIMEOUT', 'The request took too long');
        throw new SafeFetchError('NETWORK', 'The request failed');
      }
      const loc = res.headers.location;
      if (res.status >= 300 && res.status < 400 && typeof loc === 'string') {
        if (hop >= maxRedirects) throw new SafeFetchError('TOO_MANY_REDIRECTS', 'Too many redirects');
        url = checkUrlShape(new URL(loc, url).toString());
        continue;
      }
      return { status: res.status, headers: res.headers, body: res.body, finalUrl: url.toString() };
    }
  } finally {
    clearTimeout(timer);
  }
}
