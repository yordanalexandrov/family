#!/usr/bin/env node
// Drives the family web app of a verify run in headless Chrome (playwright-core + the system Chrome).
//
//   drive.mjs <scenario.mjs> [--run <id>] [--device phone|kiosk|tv] [--headed]
//
// A scenario is an ES module whose default export is `async (ctx) => {}`. ctx:
//   page, context          Playwright page and persistent context (localStorage survives between drives of a run)
//   go(path)               navigate to WEB_URL + path and wait for the network to settle
//   see(locator, label)    wait until visible (10 s), log it; throws otherwise
//   tap(locator, label)    scroll the element to the middle of the viewport (as a user would), click, log it;
//                          use instead of locator.click() on phone: the fixed bottom nav covers the bottom edge
//   step(text)             log a user action in steps.log
//   shot(name)             full-page screenshot → <out>/<nn>-<name>.png
//   aria(name)             ARIA snapshot of <body> → <out>/<nn>-<name>.aria.yml
//   psql(sql)              run SQL against the run's database, returns stdout, logs it to db.log
//   api(path, init)        fetch WEB_URL + path through the Vite proxy (as the browser would), returns JSON
//   env                    the run's RUN_ID, WEB_URL, API_URL, EVIDENCE_DIR, ...
// Output: $EVIDENCE_DIR/<timestamp>-<scenario>/ with steps.log, console.log, network.log, db.log, png, aria.yml.
// On failure: failure.png + failure.aria.yml, exit code 1.
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};
const runArg = opt('run', '');
const device = opt('device', 'phone');
const headed = flag('headed');
const scenarioPath = args[0];
if (!scenarioPath) {
  console.error(
    'usage: drive.mjs <scenario.mjs> [--run <id>] [--device phone|kiosk|tv] [--headed]',
  );
  process.exit(2);
}

const verify = join(here, 'verify.sh');
const env = Object.fromEntries(
  execFileSync(verify, ['env', ...(runArg ? [runArg] : [])], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .map((line) => [
      line.slice(0, line.indexOf('=')),
      line.slice(line.indexOf('=') + 1),
    ]),
);
const runEnv = readFileSync(join(env.RUN_DIR, 'run.env'), 'utf8');
if (existsSync(join(env.RUN_DIR, 'down'))) {
  console.error(`run ${env.RUN_ID} is down; start a new one with verify.sh up`);
  process.exit(1);
}

const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  kiosk: { width: 1280, height: 800 },
  tv: { width: 1920, height: 1080 },
};
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
const out = join(
  env.EVIDENCE_DIR,
  `${stamp}-${basename(scenarioPath, '.mjs')}`,
);
mkdirSync(out, { recursive: true });
let n = 0;
const next = (name) => `${String(++n).padStart(2, '0')}-${name}`;
const write = (file, line) =>
  appendFileSync(join(out, file), `${new Date().toISOString()} ${line}\n`);

writeFileSync(
  join(out, 'run.txt'),
  `run ${env.RUN_ID}\nscenario ${resolve(scenarioPath)}\ndevice ${device}\nweb ${env.WEB_URL}\n` +
    `git ${execFileSync('git', ['-C', here, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()}\n` +
    runEnv
      .split('\n')
      .filter((l) => l.startsWith('FINGERPRINT='))
      .join('\n') +
    '\n',
);

const chrome = [
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find(existsSync);
const context = await chromium.launchPersistentContext(
  join(env.RUN_DIR, 'profile'),
  {
    ...(process.env.CHROME_PATH || chrome
      ? { executablePath: process.env.CHROME_PATH || chrome }
      : { channel: 'chrome' }),
    headless: !headed,
    viewport: VIEWPORTS[device] ?? VIEWPORTS.phone,
    locale: 'bg-BG',
    timezoneId: 'Europe/Sofia',
    serviceWorkers: 'block',
  },
);
const page = context.pages()[0] ?? (await context.newPage());
page.on('console', (m) => write('console.log', `[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => write('console.log', `[pageerror] ${e.message}`));
page.on('response', (r) => {
  if (r.url().includes('/api/'))
    write('network.log', `${r.request().method()} ${r.status()} ${r.url()}`);
});
page.on('requestfailed', (r) =>
  write(
    'network.log',
    `FAILED ${r.method()} ${r.url()} ${r.failure()?.errorText}`,
  ),
);

const ctx = {
  page,
  context,
  env,
  device,
  out,
  async go(path) {
    write('steps.log', `go ${path}`);
    await page.goto(env.WEB_URL + path, { waitUntil: 'networkidle' });
  },
  async see(locator, label) {
    await locator.first().waitFor({ state: 'visible', timeout: 10_000 });
    write('steps.log', `see ${label ?? locator}`);
  },
  async tap(locator, label) {
    const el = locator.first();
    await el.waitFor({ state: 'visible', timeout: 10_000 });
    await el.evaluate((node) => node.scrollIntoView({ block: 'center' }));
    await el.click();
    write('steps.log', `tap ${label ?? locator}`);
  },
  step(text) {
    write('steps.log', `step ${text}`);
  },
  async shot(name) {
    const file = `${next(name)}.png`;
    await page.screenshot({ path: join(out, file), fullPage: true });
    write('steps.log', `shot ${file}`);
  },
  async aria(name) {
    const file = `${next(name)}.aria.yml`;
    writeFileSync(join(out, file), await page.locator('body').ariaSnapshot());
    write('steps.log', `aria ${file}`);
  },
  psql(sql) {
    const res = execFileSync(verify, ['psql', env.RUN_ID, '-c', sql], {
      encoding: 'utf8',
    });
    write('db.log', `${sql}\n${res}`);
    return res;
  },
  async api(path, init) {
    const res = await fetch(env.WEB_URL + path, init);
    const body = await res.text();
    write(
      'network.log',
      `[ctx.api] ${init?.method ?? 'GET'} ${res.status} ${path}`,
    );
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  },
};

let code = 0;
try {
  const scenario = (await import(pathToFileURL(resolve(scenarioPath)).href))
    .default;
  await scenario(ctx);
  write('steps.log', 'PASS');
  console.log(`PASS ${out}`);
} catch (error) {
  code = 1;
  write('steps.log', `FAIL ${error?.stack ?? error}`);
  await page
    .screenshot({ path: join(out, 'failure.png'), fullPage: true })
    .catch(() => {});
  await page
    .locator('body')
    .ariaSnapshot()
    .then((s) => writeFileSync(join(out, 'failure.aria.yml'), s))
    .catch(() => {});
  console.error(`FAIL ${out}\n${error?.message ?? error}`);
} finally {
  await context.close();
}
process.exit(code);
