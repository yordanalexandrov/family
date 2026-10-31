import { lookup as dnsLookup } from 'node:dns/promises';
// Default imports, called at request time: msw patches the modules' `request` in specs, not a named import.
import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import type { Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { STEP_PHOTO_MAX_BYTES } from '@family/shared';
import { decodeHtml } from './extract.js';

/** How the api introduces itself to recipe sites: honestly, with a link to the project (no browser disguise). */
const PAGE_USER_AGENT =
  'family-app/1.0 (+https://github.com/yordanalexandrov/family)';

const TIMEOUT_MS = 10_000;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

const PAGE_ACCEPT = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5';
const IMAGE_ACCEPT = 'image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8';

/** Statuses with which a site refuses an automated read (Cloudflare and others 403, Fastly 406, Vercel 429). */
const BLOCKING_STATUSES = new Set([403, 406, 429]);

/** Titles of the bot checks of CDNs, which some send with 200 or 503. */
const CHALLENGE_TITLE =
  /<title>\s*(just a moment|attention required|vercel security checkpoint|security verification|checking your browser)/i;

export type PageFetchFailure = 'fetch_blocked' | 'fetch_failed';

/** Why a fetch did not give a page or a picture, short, for logs and the smoke. */
export type FetchReason =
  | `http_${number}`
  | 'timeout'
  | 'aborted'
  | 'too_large'
  | WrongType
  | 'too_many_redirects'
  | 'private_address'
  | 'bad_url'
  | 'network'
  | `network_${string}`
  | 'challenge';

/** A declared type the resource does not take: not a page, not a picture. */
type WrongType = 'not_html' | 'not_image';

/** A fetched page: its final URL (after redirects) and its text; or why not ({@link FetchReason}). */
export type FetchedPage =
  | { ok: true; url: string; html: string }
  | { ok: false; url: string; failure: PageFetchFailure; reason: FetchReason };

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
  // Unspecified, loopback and the deprecated IPv4-compatible addresses (`::7f00:1` is 127.0.0.1).
  ['::', 96],
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
 * multicast or unspecified, IPv4-mapped and IPv4-compatible IPv6 included. The api runs on the home server's host
 * network (ADR-0005), so a link must never reach the LAN or the server itself.
 */
function isPublicAddress(ip: string): boolean {
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
    readonly reason: FetchReason,
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
 * The lookup of every connection: resolves the name, refuses it when any of its addresses is not public, and hands
 * the socket exactly the checked addresses, so a second DNS answer cannot swap them.
 */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  resolveHost(hostname).then(
    (addresses) => {
      if (
        addresses.length === 0 ||
        addresses.some((ip) => !isPublicAddress(ip))
      ) {
        callback(new FetchFailure('fetch_failed', 'private_address'), '', 0);
        return;
      }
      const list = addresses.map((address) => ({
        address,
        family: isIP(address),
      }));
      if (options.all) {
        (callback as unknown as (e: null, a: typeof list) => void)(null, list);
        return;
      }
      const [{ address, family }] = list as [(typeof list)[number]];
      callback(null, address, family);
    },
    (error: NodeJS.ErrnoException) => callback(error, '', 0),
  );
};

/** The response of one GET, without following redirects. */
function get(
  url: URL,
  signal: AbortSignal,
  accept: string,
): Promise<IncomingMessage> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  // Node skips the lookup for an IP literal, so it is checked here.
  if (isIP(host) !== 0 && !isPublicAddress(host)) {
    return Promise.reject(new FetchFailure('fetch_failed', 'private_address'));
  }
  const request = url.protocol === 'https:' ? https.request : http.request;
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'GET',
        signal,
        lookup: guardedLookup,
        headers: {
          'user-agent': PAGE_USER_AGENT,
          accept,
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

/** The body, at most `maxBytes` after decompression. */
async function readBody(
  response: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  const declared = Number(response.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    response.destroy();
    throw new FetchFailure('fetch_failed', 'too_large');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  const stream = decompressed(response);
  for await (const chunk of stream) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) {
      stream.destroy();
      response.destroy();
      throw new FetchFailure('fetch_failed', 'too_large');
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** Whether a declared type may be a picture: an image, a generic binary or none (the bytes tell the type later). */
function mayBeImage(contentType: string | undefined): boolean {
  return (
    contentType === undefined ||
    /^\s*(image\/|application\/octet-stream|binary\/octet-stream)/i.test(
      contentType,
    )
  );
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
 * address checked after DNS (public only), at most 3 redirects (the final URL is kept), 2 MB, 10 s, the
 * charset of the header or `<meta charset>`. No robots.txt and no way around a site's bot check: a refusal is
 * `fetch_blocked`, so the person pastes the text instead. Never throws.
 */
export async function fetchPage(url: string): Promise<FetchedPage> {
  const fetched = await fetchResource(url, {
    accept: PAGE_ACCEPT,
    maxBytes: MAX_PAGE_BYTES,
    acceptsType: isHtml,
    wrongType: 'not_html',
  });
  if (!fetched.ok) {
    return fetched;
  }
  const html = decodeHtml(fetched.body, fetched.contentType);
  if (CHALLENGE_TITLE.test(html.slice(0, 4096))) {
    return {
      ok: false,
      url: fetched.url,
      failure: 'fetch_blocked',
      reason: 'challenge',
    };
  }
  return { ok: true, url: fetched.url, html };
}

/** A fetched picture: its bytes as sent (the type is read from them when stored); or why not, as for a page. */
export type FetchedImage =
  | { ok: true; url: string; bytes: Buffer }
  | { ok: false; url: string; reason: FetchReason };

/**
 * Fetches the photo of a step of a recipe page (GLOSSARY: Снимка на стъпка) by the rules of {@link fetchPage}: public
 * addresses only at every hop, at most 3 redirects, 10 s, at most `STEP_PHOTO_MAX_BYTES` (10 MB, as an upload); a
 * declared type that is not a picture is `not_image`. `signal` aborts it with the run. Never throws.
 */
export async function fetchImage(
  url: string,
  signal?: AbortSignal,
): Promise<FetchedImage> {
  const fetched = await fetchResource(
    url,
    {
      accept: IMAGE_ACCEPT,
      maxBytes: STEP_PHOTO_MAX_BYTES,
      acceptsType: mayBeImage,
      wrongType: 'not_image',
    },
    signal,
  );
  return fetched.ok
    ? { ok: true, url: fetched.url, bytes: fetched.body }
    : { ok: false, url: fetched.url, reason: fetched.reason };
}

/** What one kind of resource takes: its `Accept`, its largest body, the declared types it reads and the reason else. */
interface ResourceRules {
  accept: string;
  maxBytes: number;
  acceptsType: (contentType: string | undefined) => boolean;
  wrongType: WrongType;
}

type FetchedResource =
  | { ok: true; url: string; body: Buffer; contentType: string | undefined }
  | { ok: false; url: string; failure: PageFetchFailure; reason: FetchReason };

async function fetchResource(
  url: string,
  rules: ResourceRules,
  outer?: AbortSignal,
): Promise<FetchedResource> {
  // A timer, not `AbortSignal.timeout`, so a spec can move the clock.
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('timeout', 'TimeoutError')),
    TIMEOUT_MS,
  );
  const signal = outer
    ? AbortSignal.any([controller.signal, outer])
    : controller.signal;
  try {
    return await fetchWithin(url, rules, signal);
  } finally {
    clearTimeout(timer);
  }
}

const UTF8 = new TextDecoder('utf-8', { fatal: true });

/**
 * A `Location` as the site meant it: Node reads header bytes as latin1, so the raw UTF-8 of a Cyrillic path arrives
 * as mojibake; it is read as UTF-8 again. ASCII (percent-encoded included) and bytes that are not UTF-8 stay as
 * they are.
 */
function utf8Location(location: string): string {
  if (!/[^\x20-\x7e]/.test(location)) {
    return location;
  }
  try {
    return UTF8.decode(Buffer.from(location, 'latin1'));
  } catch {
    return location;
  }
}

async function fetchWithin(
  url: string,
  rules: ResourceRules,
  signal: AbortSignal,
): Promise<FetchedResource> {
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
      const response = await get(current, signal, rules.accept);
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        if (redirects === MAX_REDIRECTS) {
          throw new FetchFailure('fetch_failed', 'too_many_redirects');
        }
        current = new URL(utf8Location(location), current);
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
      if (!rules.acceptsType(contentType)) {
        response.resume();
        throw new FetchFailure('fetch_failed', rules.wrongType);
      }
      const body = await readBody(response, rules.maxBytes);
      return { ok: true, url: current.href, body, contentType };
    }
  } catch (error) {
    const { failure, reason } = failureOf(error, signal);
    return { ok: false, url: current.href, failure, reason };
  }
}
