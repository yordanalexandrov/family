import { lookup as dnsLookup } from 'node:dns/promises';
// Default imports, called at request time: msw patches the modules' `request` in specs, not a named import.
import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import type { Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { decodeHtml } from './extract.js';

/** How the api introduces itself to recipe sites: honestly, with a link to the project (no browser disguise). */
export const PAGE_USER_AGENT =
  'family-app/1.0 (+https://github.com/yordanalexandrov/family)';

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

/** Statuses with which a site refuses an automated read (Cloudflare and others 403, Fastly 406, Vercel 429). */
const BLOCKING_STATUSES = new Set([403, 406, 429]);

/** Titles of the bot checks of CDNs, which some send with 200 or 503. */
const CHALLENGE_TITLE =
  /<title>\s*(just a moment|attention required|vercel security checkpoint|security verification|checking your browser)/i;

export type PageFetchFailure = 'fetch_blocked' | 'fetch_failed';

/**
 * A fetched page: its final URL (after redirects) and its text; or why not, with a short `reason` for logs and the
 * smoke (`http_404`, `timeout`, `too_large`, `not_html`, `too_many_redirects`, `private_address`, `bad_url`,
 * `network_<code>`, `challenge`).
 */
export type FetchedPage =
  | { ok: true; url: string; html: string }
  | { ok: false; url: string; failure: PageFetchFailure; reason: string };

export interface FetchPageOptions {
  /** Defaults to {@link isPublicAddress}; specs let their local server through. */
  allowAddress?: (ip: string) => boolean;
  /** One budget for every redirect and the body: 10 s. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

const PRIVATE = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  PRIVATE.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  PRIVATE.addSubnet(network, prefix, 'ipv6');
}

/**
 * Whether the api may connect to `ip`: not loopback, private, link-local (cloud metadata), CGNAT, documentation,
 * multicast or unspecified, IPv4-mapped IPv6 included. The api runs on the home server's host network (ADR-0005), so
 * a link must never reach the LAN or the server itself.
 */
export function isPublicAddress(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1];
  if (mapped) {
    return isPublicAddress(mapped);
  }
  const family = isIP(ip);
  if (family === 0) {
    return false;
  }
  return !PRIVATE.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

class FetchFailure extends Error {
  constructor(
    readonly failure: PageFetchFailure,
    readonly reason: string,
  ) {
    super(reason);
  }
}

async function resolveHost(hostname: string): Promise<string[]> {
  return (await dnsLookup(hostname, { all: true })).map(
    ({ address }) => address,
  );
}

/**
 * The lookup of every connection: resolves the name, refuses it when any of its addresses is one `allow` refuses,
 * and hands the socket exactly the checked addresses, so a second DNS answer cannot swap them.
 */
function guardedLookup(allow: (ip: string) => boolean): LookupFunction {
  return (hostname, options, callback) => {
    resolveHost(hostname).then(
      (addresses) => {
        if (addresses.length === 0 || addresses.some((ip) => !allow(ip))) {
          callback(new FetchFailure('fetch_failed', 'private_address'), '', 0);
          return;
        }
        const list = addresses.map((address) => ({
          address,
          family: isIP(address),
        }));
        if (options.all) {
          (callback as unknown as (e: null, a: typeof list) => void)(
            null,
            list,
          );
          return;
        }
        const [{ address, family }] = list as [(typeof list)[number]];
        callback(null, address, family);
      },
      (error: NodeJS.ErrnoException) => callback(error, '', 0),
    );
  };
}

/** The response of one GET, without following redirects. */
function get(
  url: URL,
  allow: (ip: string) => boolean,
  signal: AbortSignal,
): Promise<IncomingMessage> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  // Node skips the lookup for an IP literal, so it is checked here.
  if (isIP(host) !== 0 && !allow(host)) {
    return Promise.reject(new FetchFailure('fetch_failed', 'private_address'));
  }
  const request = url.protocol === 'https:' ? https.request : http.request;
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'GET',
        signal,
        lookup: guardedLookup(allow),
        headers: {
          'user-agent': PAGE_USER_AGENT,
          accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'accept-language': 'bg,en;q=0.8',
          'accept-encoding': 'gzip, deflate, br',
        },
      },
      resolve,
    );
    req.on('error', reject);
    req.end();
  });
}

function decompressed(response: IncomingMessage): Readable {
  switch (response.headers['content-encoding']?.trim().toLowerCase()) {
    case 'gzip':
    case 'x-gzip':
      return response.pipe(createGunzip());
    case 'deflate':
      return response.pipe(createInflate());
    case 'br':
      return response.pipe(createBrotliDecompress());
    default:
      return response;
  }
}

/** The body, at most `MAX_BYTES` after decompression. */
async function readBody(response: IncomingMessage): Promise<Buffer> {
  const declared = Number(response.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    response.destroy();
    throw new FetchFailure('fetch_failed', 'too_large');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  const stream = decompressed(response);
  for await (const chunk of stream) {
    size += (chunk as Buffer).length;
    if (size > MAX_BYTES) {
      stream.destroy();
      response.destroy();
      throw new FetchFailure('fetch_failed', 'too_large');
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

function isHtml(contentType: string | undefined): boolean {
  // Without a type a page is still read; a declared other type (PDF, image, JSON) is not a page.
  return (
    contentType === undefined ||
    /^\s*(text\/html|application\/xhtml\+xml)/i.test(contentType)
  );
}

function failureOf(error: unknown, signal: AbortSignal): FetchFailure {
  if (error instanceof FetchFailure) {
    return error;
  }
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof FetchFailure) {
    return cause;
  }
  if (signal.aborted) {
    return new FetchFailure(
      'fetch_failed',
      signal.reason instanceof DOMException &&
        signal.reason.name === 'TimeoutError'
        ? 'timeout'
        : 'aborted',
    );
  }
  const code = (error as { code?: unknown }).code;
  return new FetchFailure(
    'fetch_failed',
    typeof code === 'string' ? `network_${code}` : 'network',
  );
}

/**
 * Fetches a recipe page for an import by link (GLOSSARY: Внасяне на рецепта): `http`/`https` only, every hop's
 * address checked after DNS ({@link isPublicAddress}), at most 3 redirects (the final URL is kept), 2 MB, 10 s, the
 * charset of the header or `<meta charset>`. No robots.txt and no way around a site's bot check: a refusal is
 * `fetch_blocked`, so the person pastes the text instead. Never throws.
 */
export async function fetchPage(
  url: string,
  options: FetchPageOptions = {},
): Promise<FetchedPage> {
  const allow = options.allowAddress ?? isPublicAddress;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS);
  const signal = options.signal
    ? AbortSignal.any([timeout, options.signal])
    : timeout;
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    return { ok: false, url, failure: 'fetch_failed', reason: 'bad_url' };
  }
  try {
    for (let redirects = 0; ; redirects++) {
      if (current.protocol !== 'http:' && current.protocol !== 'https:') {
        throw new FetchFailure('fetch_failed', 'bad_url');
      }
      const response = await get(current, allow, signal);
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        if (redirects === MAX_REDIRECTS) {
          throw new FetchFailure('fetch_failed', 'too_many_redirects');
        }
        current = new URL(location, current);
        continue;
      }
      if (
        BLOCKING_STATUSES.has(status) ||
        response.headers['cf-mitigated'] === 'challenge'
      ) {
        response.resume();
        throw new FetchFailure('fetch_blocked', `http_${status}`);
      }
      if (status < 200 || status >= 300) {
        response.resume();
        throw new FetchFailure('fetch_failed', `http_${status}`);
      }
      const contentType = response.headers['content-type'];
      if (!isHtml(contentType)) {
        response.resume();
        throw new FetchFailure('fetch_failed', 'not_html');
      }
      const html = decodeHtml(await readBody(response), contentType);
      if (CHALLENGE_TITLE.test(html.slice(0, 4096))) {
        throw new FetchFailure('fetch_blocked', 'challenge');
      }
      return { ok: true, url: current.href, html };
    }
  } catch (error) {
    const { failure, reason } = failureOf(error, signal);
    return { ok: false, url: current.href, failure, reason };
  }
}
