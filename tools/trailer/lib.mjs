// Shared helpers for the trailer tools: the game's client (Vite) pointed at the trailer world's server, a browser,
// and game pages that run on the fake clock in director.js. Modelled on Papercut's tools/store.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../..');
// Vite and its React plugin live in the client workspace.
const fromClient = (p) => import(pathToFileURL(join(ROOT, 'client/node_modules', p)).href);
const { createServer } = await fromClient('vite/dist/node/index.js');
const react = (await fromClient('@vitejs/plugin-react/dist/index.js')).default;
export const OUT = join(ROOT, 'art/trailer');
export const FPS = 30;
/** The trailer world's game server (see setup.mjs). */
export const API = process.env.TRAILER_API ?? 'http://localhost:3100';
export const LOGIN = { username: 'Myrmidon', password: 'trailer-pass-1' };

/** The game's client, served by Vite with its /api proxied to the trailer server. Also serves these tools' pages. */
export async function startClient(port = 5299) {
  const server = await createServer({
    configFile: false,
    root: join(ROOT, 'client'),
    plugins: [react()],
    logLevel: 'error',
    server: { port, strictPort: false, fs: { allow: [ROOT] }, proxy: { '/api': { target: API, ws: true } } },
  });
  await server.listen();
  return { server, url: server.resolvedUrls.local[0] };
}

/** Chromium with the GPU (fast). CHROME_PATH overrides; else Playwright's own install. */
export async function launch({ headless = true } = {}) {
  const base = process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'ms-playwright');
  const guess = base && join(base, 'chromium_headless_shell-1148/chrome-win/headless_shell.exe');
  const executablePath = process.env.CHROME_PATH || (guess && existsSync(guess) ? guess : undefined);
  return chromium.launch({
    executablePath,
    headless,
    args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
}

const director = readFileSync(join(HERE, 'director.js'), 'utf8');

/** A logged-in game page at w × h on the fake clock. `local` sets localStorage before the game loads. */
export async function openGame(browser, url, { w = 1920, h = 1080, local = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, timezoneId: middayZone() });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.addInitScript({ content: `window.__TRAILER_LOCAL = ${JSON.stringify(local)};\n${director}` });
  // log in through the API (the cookie lands in this context)
  const r = await page.request.post(`${url}api/auth/login`, { data: LOGIN });
  if (!r.ok()) throw new Error(`login failed: ${r.status()} ${await r.text()}`);
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('.app'), null, { timeout: 60000, polling: 250 });
  return page;
}

/** Move the fake clock on by `secs`, `n` times (each is one drawn frame). */
export const tick = (page, secs = 1 / FPS, n = 1) => page.evaluate(({ secs, n }) => window.__trailer.tick(secs, n), { secs, n });
/** Let real time pass (network, model loading) while the fake clock runs on, so the page settles. */
export async function settle(page, secs = 2) {
  const steps = Math.ceil(secs * 10);
  for (let i = 0; i < steps; i++) {
    await tick(page, 0.1);
    await page.waitForTimeout(100);
  }
}

/** A time zone where it is about midday right now: the nest's sky follows the local hour, and a trailer wants daylight. */
export function middayZone() {
  const zones = ['Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
    'America/Sao_Paulo', 'Atlantic/Azores', 'Europe/London', 'Europe/Paris', 'Europe/Athens', 'Europe/Moscow', 'Asia/Dubai', 'Asia/Karachi',
    'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Noumea', 'Pacific/Auckland'];
  const hour = (z) => Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: z }).format(new Date()));
  return zones.reduce((best, z) => (Math.abs(hour(z) - 12) < Math.abs(hour(best) - 12) ? z : best));
}

/** Run the page on (real time and fake) until `test()` is true in it. */
export async function until(page, test, secs = 90) {
  for (let i = 0; i < secs * 2; i++) {
    if (await page.evaluate(test)) return;
    await settle(page, 0.5);
  }
  throw new Error(`timed out waiting for ${test}`);
}
