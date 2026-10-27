import { once } from 'node:events';
import {
  createServer,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchPage, isPublicAddress, PAGE_USER_AGENT } from './fetch.js';

const RECIPE =
  '<html><head><title>Боб чорба</title></head><body>Продукти: боб</body></html>';

/** A local stand-in for recipe sites; each path answers one way. */
let server: Server;
let base: string;
let lastHeaders: IncomingHttpHeaders = {};

function html(
  res: ServerResponse,
  body: string | Buffer,
  type = 'text/html; charset=utf-8',
) {
  res.writeHead(200, { 'content-type': type });
  res.end(body);
}

function redirect(res: ServerResponse, location: string, status = 302) {
  res.writeHead(status, { location });
  res.end();
}

beforeAll(async () => {
  server = createServer((req, res) => {
    lastHeaders = req.headers;
    const path = req.url ?? '/';
    const hop = /^\/hop\/(\d+)$/.exec(path);
    if (hop) {
      const left = Number(hop[1]);
      return left === 0
        ? html(res, RECIPE)
        : redirect(res, `/hop/${left - 1}`, 301);
    }
    switch (path) {
      case '/recipe':
        return html(res, RECIPE);
      case '/gzip':
        res.writeHead(200, {
          'content-type': 'text/html',
          'content-encoding': 'gzip',
        });
        return res.end(gzipSync(RECIPE));
      case '/cp1251':
        return html(
          res,
          Buffer.from([0xc1, 0xee, 0xe1, 0x20, 0xf7, 0xee, 0xf0, 0xe1, 0xe0]), // „Боб чорба“
          'text/html; charset=windows-1251',
        );
      case '/big': {
        res.writeHead(200, { 'content-type': 'text/html' });
        const chunk = 'а'.repeat(256 * 1024);
        for (let i = 0; i < 9; i++) res.write(chunk); // 9 × 512 KB (2 bytes a letter) > 2 MB
        return res.end();
      }
      case '/slow':
        return; // never answers
      case '/forbidden':
        res.writeHead(403, { 'content-type': 'text/html' });
        return res.end('<title>Just a moment...</title>');
      case '/not-acceptable':
        res.writeHead(406);
        return res.end();
      case '/too-many':
        res.writeHead(429, { 'content-type': 'text/html' });
        return res.end('<title>Vercel Security Checkpoint</title>');
      case '/challenge':
        res.writeHead(503, {
          'content-type': 'text/html',
          'cf-mitigated': 'challenge',
        });
        return res.end('<title>Just a moment...</title>');
      case '/challenge-page':
        return html(
          res,
          '<html><head><title>Just a moment...</title></head><body>Checking your browser</body></html>',
        );
      case '/missing':
        res.writeHead(404, { 'content-type': 'text/html' });
        return res.end('<h1>Not found</h1>');
      case '/pdf':
        return html(res, '%PDF-1.7', 'application/pdf');
      case '/to-private':
        return redirect(res, 'http://10.0.0.1/recipe');
      case '/to-metadata':
        return redirect(res, 'http://169.254.169.254/latest/meta-data');
      default:
        res.writeHead(404);
        return res.end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  server.close();
  await once(server, 'close');
});

/** The test server is on loopback; everything else goes by the real rule. */
const allowTestServer = (ip: string) =>
  ip === '127.0.0.1' || isPublicAddress(ip);

function get(path: string, options: Parameters<typeof fetchPage>[1] = {}) {
  return fetchPage(`${base}${path}`, {
    allowAddress: allowTestServer,
    ...options,
  });
}

describe('fetchPage', () => {
  it('fetches an HTML page with an honest User-Agent', async () => {
    const page = await get('/recipe');

    expect(page).toEqual({ ok: true, url: `${base}/recipe`, html: RECIPE });
    expect(lastHeaders['user-agent']).toBe(PAGE_USER_AGENT);
    expect(PAGE_USER_AGENT).toBe(
      'family-app/1.0 (+https://github.com/yordanalexandrov/family)',
    );
  });

  it('follows up to 3 redirects and keeps the final URL', async () => {
    expect(await get('/hop/3')).toMatchObject({
      ok: true,
      url: `${base}/hop/0`,
      html: RECIPE,
    });
  });

  it('gives up after a 4th redirect', async () => {
    expect(await get('/hop/4')).toMatchObject({
      ok: false,
      failure: 'fetch_failed',
      reason: 'too_many_redirects',
    });
  });

  it('decodes gzip and the charset of the header (windows-1251)', async () => {
    expect(await get('/gzip')).toMatchObject({ ok: true, html: RECIPE });
    expect(await get('/cp1251')).toMatchObject({ ok: true, html: 'Боб чорба' });
  });

  it('refuses a page over 2 MB', async () => {
    expect(await get('/big')).toMatchObject({
      ok: false,
      failure: 'fetch_failed',
      reason: 'too_large',
    });
  });

  it('gives up after the timeout', async () => {
    expect(await get('/slow', { timeoutMs: 200 })).toMatchObject({
      ok: false,
      failure: 'fetch_failed',
      reason: 'timeout',
    });
  });

  it('tells a site that refuses automated reads (403, 406, 429, a bot check) as blocked', async () => {
    for (const path of [
      '/forbidden',
      '/not-acceptable',
      '/too-many',
      '/challenge',
      '/challenge-page',
    ]) {
      expect(await get(path), path).toMatchObject({
        ok: false,
        failure: 'fetch_blocked',
      });
    }
  });

  it('fails on another error status and on a page that is not HTML', async () => {
    expect(await get('/missing')).toMatchObject({
      ok: false,
      failure: 'fetch_failed',
      reason: 'http_404',
    });
    expect(await get('/pdf')).toMatchObject({
      ok: false,
      failure: 'fetch_failed',
      reason: 'not_html',
    });
  });

  it('refuses loopback, private and link-local addresses, by IP and by name, before connecting', async () => {
    for (const url of [
      `${base}/recipe`,
      `http://localhost:${new URL(base).port}/recipe`,
      'http://10.0.0.1/recipe',
      'http://192.168.1.10/recipe',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/recipe',
    ]) {
      expect(await fetchPage(url), url).toMatchObject({
        ok: false,
        failure: 'fetch_failed',
        reason: 'private_address',
      });
    }
  });

  it('refuses a redirect to a private or link-local address', async () => {
    for (const path of ['/to-private', '/to-metadata']) {
      expect(await get(path), path).toMatchObject({
        ok: false,
        failure: 'fetch_failed',
        reason: 'private_address',
      });
    }
  });

  it('fetches only http and https', async () => {
    for (const url of ['ftp://example.com/recipe', 'file:///etc/passwd']) {
      expect(await fetchPage(url), url).toMatchObject({
        ok: false,
        failure: 'fetch_failed',
        reason: 'bad_url',
      });
    }
  });
});

describe('isPublicAddress', () => {
  it('allows public IPv4 and IPv6 addresses', () => {
    for (const ip of ['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111']) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });

  it('refuses loopback, private, link-local, CGNAT, unspecified and mapped private addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '127.8.9.10',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.0.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      '::',
      'fe80::1',
      'fd00::1',
      '::ffff:127.0.0.1',
      '::ffff:10.0.0.1',
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });
});
