import nodeHttp, { type RequestOptions } from 'node:http';
import type { AddressInfo, LookupFunction } from 'node:net';
import { gzipSync } from 'node:zlib';
import { HttpResponse, http } from 'msw';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { server } from '../../test/msw.js';
import { fetchImage, fetchPage } from './fetch.js';

const RECIPE =
  '<html><head><title>Боб чорба</title></head><body>Продукти: боб</body></html>';

const SITE = 'https://recepti.example';

function html(body: string | Uint8Array, type = 'text/html; charset=utf-8') {
  return new HttpResponse(body, { headers: { 'content-type': type } });
}

function redirect(location: string, status = 302) {
  return new HttpResponse(null, { status, headers: { location } });
}

const CYRILLIC_PATH = '/рецепта/1027/баница-със-сирене';
const CYRILLIC_URL = `${SITE}${encodeURI(CYRILLIC_PATH)}`;

/** Recipe sites at HTTP level; each path answers one way. Returns the User-Agent of every request. */
function serveSites() {
  const userAgents: (string | null)[] = [];
  server.use(
    http.all('*', ({ request }) => {
      userAgents.push(request.headers.get('user-agent'));
    }),
    http.get(`${SITE}/recipe`, () => html(RECIPE)),
    http.get(`${SITE}/hop/:left`, ({ params }) => {
      const left = Number(params.left);
      return left === 0 ? html(RECIPE) : redirect(`/hop/${left - 1}`, 301);
    }),
    http.get(`${SITE}/to-encoded`, () => redirect(CYRILLIC_URL, 301)),
    http.get(CYRILLIC_URL, () => html(RECIPE)),
    http.get(
      `${SITE}/gzip`,
      () =>
        new HttpResponse(gzipSync(RECIPE), {
          headers: { 'content-type': 'text/html', 'content-encoding': 'gzip' },
        }),
    ),
    http.get(`${SITE}/cp1251`, () =>
      html(
        new Uint8Array([0xc1, 0xee, 0xe1, 0x20, 0xf7, 0xee, 0xf0, 0xe1, 0xe0]), // „Боб чорба“
        'text/html; charset=windows-1251',
      ),
    ),
    // 11 × 100 000 letters × 2 bytes > 2 MB, without a content-length to refuse it up front.
    http.get(`${SITE}/big`, () => {
      const chunk = new TextEncoder().encode('а'.repeat(100_000));
      let left = 11;
      return new HttpResponse(
        new ReadableStream({
          pull(controller) {
            if (left-- === 0) {
              controller.close();
            } else {
              controller.enqueue(chunk);
            }
          },
        }),
        { headers: { 'content-type': 'text/html' } },
      );
    }),
    http.get(`${SITE}/slow`, () => new Promise<Response>(() => {})),
    http.get(
      `${SITE}/forbidden`,
      () =>
        new HttpResponse('<title>Just a moment...</title>', {
          status: 403,
          headers: { 'content-type': 'text/html' },
        }),
    ),
    http.get(
      `${SITE}/not-acceptable`,
      () => new HttpResponse(null, { status: 406 }),
    ),
    http.get(
      `${SITE}/too-many`,
      () =>
        new HttpResponse('<title>Vercel Security Checkpoint</title>', {
          status: 429,
          headers: { 'content-type': 'text/html' },
        }),
    ),
    http.get(
      `${SITE}/challenge`,
      () =>
        new HttpResponse('<title>Just a moment...</title>', {
          status: 503,
          headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' },
        }),
    ),
    http.get(`${SITE}/challenge-page`, () =>
      html(
        '<html><head><title>Just a moment...</title></head><body>Checking your browser</body></html>',
      ),
    ),
    http.get(
      `${SITE}/missing`,
      () =>
        new HttpResponse('<h1>Not found</h1>', {
          status: 404,
          headers: { 'content-type': 'text/html' },
        }),
    ),
    http.get(`${SITE}/pdf`, () => html('%PDF-1.7', 'application/pdf')),
    http.get(`${SITE}/to-private`, () => redirect('http://10.0.0.1/recipe')),
    http.get(`${SITE}/to-metadata`, () =>
      redirect('http://169.254.169.254/latest/meta-data'),
    ),
    http.get(`${SITE}/to-mapped-loopback`, () =>
      redirect('http://[::ffff:7f00:1]/recipe'),
    ),
    http.get('http://93.184.216.34/recipe', () => html(RECIPE)),
    http.get('http://[2606:4700:4700::1111]/recipe', () => html(RECIPE)),
    http.get('http://[::ffff:5db8:d822]/recipe', () => html(RECIPE)),
  );
  return { userAgents };
}

// msw answers for the sites, but it opens no socket and so skips the DNS lookup: what a name resolves to is checked
// in the next describe, without msw; a raw non-ASCII `Location` in the last one (docs/testing.md).
describe('fetchPage', () => {
  beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
  afterEach(() => {
    server.resetHandlers();
    vi.useRealTimers();
  });
  afterAll(() => server.close());

  it('fetches an HTML page with an honest User-Agent', async () => {
    const sites = serveSites();

    const page = await fetchPage(`${SITE}/recipe`);

    expect(page).toEqual({ ok: true, url: `${SITE}/recipe`, html: RECIPE });
    expect(sites.userAgents).toEqual([
      'family-app/1.0 (+https://github.com/yordanalexandrov/family)',
    ]);
  });

  it('follows up to 3 redirects and keeps the final URL', async () => {
    serveSites();
    expect(await fetchPage(`${SITE}/hop/3`)).toMatchObject({
      ok: true,
      url: `${SITE}/hop/0`,
      html: RECIPE,
    });
  });

  it('gives up after a 4th redirect', async () => {
    serveSites();
    expect(await fetchPage(`${SITE}/hop/4`)).toMatchObject({
      ok: false,
      failure: 'fetch_failed',
      reason: 'too_many_redirects',
    });
  });

  it('follows a percent-encoded Location unchanged', async () => {
    serveSites();
    expect(await fetchPage(`${SITE}/to-encoded`)).toMatchObject({
      ok: true,
      url: CYRILLIC_URL,
    });
  });

  it('decodes gzip and the charset of the header (windows-1251)', async () => {
    serveSites();
    expect(await fetchPage(`${SITE}/gzip`)).toMatchObject({
      ok: true,
      html: RECIPE,
    });
    expect(await fetchPage(`${SITE}/cp1251`)).toMatchObject({
      ok: true,
      html: 'Боб чорба',
    });
  });

  it('refuses a page over 2 MB', async () => {
    serveSites();
    expect(await fetchPage(`${SITE}/big`)).toMatchObject({
      ok: false,
      failure: 'fetch_failed',
      reason: 'too_large',
    });
  });

  it('gives up after 10 seconds', async () => {
    serveSites();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const page = fetchPage(`${SITE}/slow`);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await page).toMatchObject({
      ok: false,
      failure: 'fetch_failed',
      reason: 'timeout',
    });
  });

  it('tells a site that refuses automated reads (403, 406, 429, a bot check) as blocked', async () => {
    serveSites();
    for (const path of [
      '/forbidden',
      '/not-acceptable',
      '/too-many',
      '/challenge',
      '/challenge-page',
    ]) {
      expect(await fetchPage(`${SITE}${path}`), path).toMatchObject({
        ok: false,
        failure: 'fetch_blocked',
      });
    }
  });

  it('fails on another error status and on a page that is not HTML', async () => {
    serveSites();
    expect(await fetchPage(`${SITE}/missing`)).toMatchObject({
      ok: false,
      failure: 'fetch_failed',
      reason: 'http_404',
    });
    expect(await fetchPage(`${SITE}/pdf`)).toMatchObject({
      ok: false,
      failure: 'fetch_failed',
      reason: 'not_html',
    });
  });

  it('fetches from a public IPv4, IPv6 and IPv4-mapped IPv6 address', async () => {
    serveSites();
    for (const url of [
      'http://93.184.216.34/recipe',
      'http://[2606:4700:4700::1111]/recipe',
      'http://[::ffff:93.184.216.34]/recipe',
    ]) {
      expect(await fetchPage(url), url).toMatchObject({ ok: true });
    }
  });

  it('refuses loopback, private, link-local, CGNAT, unspecified, mapped and IPv4-compatible addresses before connecting', async () => {
    serveSites();
    for (const url of [
      'http://127.0.0.1/recipe',
      'http://127.8.9.10/recipe',
      'http://10.1.2.3/recipe',
      'http://172.16.0.1/recipe',
      'http://172.31.255.255/recipe',
      'http://192.168.1.10/recipe',
      'http://169.254.169.254/latest/meta-data',
      'http://100.64.0.1/recipe',
      'http://0.0.0.0/recipe',
      'http://[::1]/recipe',
      'http://[::]/recipe',
      'http://[fe80::1]/recipe',
      'http://[fd00::1]/recipe',
      'http://[::ffff:127.0.0.1]/recipe',
      'http://[::ffff:10.0.0.1]/recipe',
      'http://[::7f00:1]/recipe',
      'http://[::a00:1]/recipe',
    ]) {
      expect(await fetchPage(url), url).toMatchObject({
        ok: false,
        failure: 'fetch_failed',
        reason: 'private_address',
      });
    }
  });

  it('refuses a redirect to a private, link-local or mapped loopback address', async () => {
    serveSites();
    for (const path of ['/to-private', '/to-metadata', '/to-mapped-loopback']) {
      expect(await fetchPage(`${SITE}${path}`), path).toMatchObject({
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

// No msw here: the name goes through the real DNS lookup (`localhost` from the hosts file, no network), and the guard
// refuses its address before a socket connects, so nothing needs to listen on the port.
describe('fetchPage by a name that resolves to a private address', () => {
  it('refuses it before connecting', async () => {
    expect(await fetchPage('http://localhost:9/recipe')).toMatchObject({
      ok: false,
      failure: 'fetch_failed',
      reason: 'private_address',
    });
  });
});

// No msw here either: msw writes a header as UTF-8 text, so it cannot send the raw bytes of a non-ASCII `Location`
// that Node reads as latin1. A real server on loopback answers for `recepti.test`, and only the lookup of that name
// is pointed at it; the socket and Node's parser are the real ones.
describe('a redirect whose Location is not ASCII', () => {
  const photo = '/снимки/баница.jpg';
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  let site = '';
  let local: nodeHttp.Server;

  /** A `Location` as Node reads it: the UTF-8 bytes of `target`, each byte one latin1 character. */
  function rawLocation(target: string) {
    return Buffer.from(target, 'utf8').toString('latin1');
  }

  beforeAll(async () => {
    local = nodeHttp.createServer((req, res) => {
      const redirects: Record<string, string> = {
        '/absolute': `${site}${CYRILLIC_PATH}`,
        '/relative': CYRILLIC_PATH,
        '/photo': photo,
      };
      const target = redirects[req.url ?? ''];
      if (req.url === '/latin1') {
        res.writeHead(301, { location: '/caf\xe9' }).end();
      } else if (target) {
        res.writeHead(301, { location: rawLocation(target) }).end();
      } else if (req.url === encodeURI(CYRILLIC_PATH)) {
        res.writeHead(200, { 'content-type': 'text/html' }).end(RECIPE);
      } else if (req.url === '/caf%C3%A9') {
        res.writeHead(200, { 'content-type': 'text/html' }).end(RECIPE);
      } else if (req.url === encodeURI(photo)) {
        res.writeHead(200, { 'content-type': 'image/jpeg' }).end(JPEG);
      } else {
        res.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => local.listen(0, '127.0.0.1', resolve));
    site = `http://recepti.test:${(local.address() as AddressInfo).port}`;
    const toLocal: LookupFunction = (_hostname, options, callback) => {
      if (options.all) {
        (callback as unknown as (e: null, a: object[]) => void)(null, [
          { address: '127.0.0.1', family: 4 },
        ]);
      } else {
        callback(null, '127.0.0.1', 4);
      }
    };
    const request = nodeHttp.request.bind(nodeHttp);
    vi.spyOn(nodeHttp, 'request').mockImplementation(((
      url: URL,
      options: RequestOptions,
      callback: (res: nodeHttp.IncomingMessage) => void,
    ) =>
      request(
        url,
        { ...options, lookup: toLocal },
        callback,
      )) as unknown as typeof nodeHttp.request);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await new Promise((resolve) => local.close(resolve));
  });

  it('reaches the page of a Cyrillic Location in raw UTF-8, absolute or relative', async () => {
    for (const path of ['/absolute', '/relative']) {
      expect(await fetchPage(`${site}${path}`), path).toEqual({
        ok: true,
        url: `${site}/%D1%80%D0%B5%D1%86%D0%B5%D0%BF%D1%82%D0%B0/1027/%D0%B1%D0%B0%D0%BD%D0%B8%D1%86%D0%B0-%D1%81%D1%8A%D1%81-%D1%81%D0%B8%D1%80%D0%B5%D0%BD%D0%B5`,
        html: RECIPE,
      });
    }
  });

  it('reaches the photo of a step the same way', async () => {
    expect(await fetchImage(`${site}/photo`)).toEqual({
      ok: true,
      url: `${site}/%D1%81%D0%BD%D0%B8%D0%BC%D0%BA%D0%B8/%D0%B1%D0%B0%D0%BD%D0%B8%D1%86%D0%B0.jpg`,
      bytes: JPEG,
    });
  });

  it('reads a Location that is not UTF-8 as latin1', async () => {
    expect(await fetchPage(`${site}/latin1`)).toMatchObject({
      ok: true,
      url: `${site}/caf%C3%A9`,
    });
  });
});
