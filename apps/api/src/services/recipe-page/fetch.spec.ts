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
import { fetchPage } from './fetch.js';

const RECIPE =
  '<html><head><title>Боб чорба</title></head><body>Продукти: боб</body></html>';

const SITE = 'https://recepti.example';

function html(body: string | Uint8Array, type = 'text/html; charset=utf-8') {
  return new HttpResponse(body, { headers: { 'content-type': type } });
}

function redirect(location: string, status = 302) {
  return new HttpResponse(null, { status, headers: { location } });
}

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
// in the describe after this one, without msw (docs/testing.md).
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
