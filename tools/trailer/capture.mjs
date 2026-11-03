// The trailer, captured from the real game: npm run trailer -> art/trailer/hormigas_trailer_1080p30.mp4
// 1. world.mjs builds a fresh local trailer world (a late-game colony, rivals, a fought raid, columns on the march).
// 2. The game runs in a headless browser on the fake clock (director.js); each shot flies the camera by hand and
//    saves every frame. Captions are drawn on top, in the game's own fonts.
// 3. The game's march is rendered offline to fit the edit (music.mjs), and ffmpeg puts it all together.
// Needs Docker's Postgres running (docker compose -p hormigas up -d) and nothing else on port 3100.
// --vertical makes the 15-second 9:16 cut for phones and social posts instead (hormigas_trailer_vertical_1080x1920.mp4).

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FPS, HERE, OUT, launch, openGame, settle, startClient, tick, until } from './lib.mjs';
import { HIDE, LOCAL } from './shots.mjs';
import { renderMusic } from './music.mjs';
import { prepareWorld } from './world.mjs';

const args = process.argv.slice(2);
const V = args.includes('--vertical'); // the 15-second 9:16 cut
const W = V ? 1080 : 1920, H = V ? 1920 : 1080;
const TMP = join(HERE, 'cache', V ? 'vertical' : 'trailer');
mkdirSync(TMP, { recursive: true });
for (const f of readdirSync(TMP)) rmSync(join(TMP, f), { recursive: true, force: true }); // last run's frames
const only = args.find((a) => !a.startsWith('--')); // capture a single shot by name, to check it (no edit)

const world = await prepareWorld();
const { server, url } = await startClient();
const browser = await launch();

// ---------- the page ----------
const CAPTION_CSS = `#__cap{position:fixed;left:50%;bottom:8.5%;transform:translateX(-50%);z-index:9999;font:700 54px/1.1 'Bricolage Grotesque',sans-serif;
letter-spacing:-.01em;color:#f6ecd6;background:rgba(35,26,20,.86);border-left:10px solid #e8b23a;border-radius:10px;padding:16px 34px 20px;white-space:nowrap;
box-shadow:0 10px 40px rgba(0,0,0,.35);transition:none}#__cap:empty{display:none}`
  // portrait: bigger, wrapping evenly, near the top (clear of the action, and below the strip phone apps cover)
  + (V ? `#__cap{top:12%;bottom:auto;font-size:64px;white-space:normal;text-wrap:balance;width:max-content;max-width:84%;text-align:center;padding:18px 36px 24px}` : '');
const page = await openGame(browser, url, { w: W, h: H, local: LOCAL });
await page.evaluate(({ hide, css }) => {
  window.__TRAILER_HIDE = hide;
  window.__trailer.chrome('none');
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const d = document.createElement('div'); d.id = '__cap'; document.body.appendChild(d);
}, { hide: HIDE, css: CAPTION_CSS });
await until(page, () => !!window.__yard);
// the yard flies to your colony once it has loaded: let that finish before taking the camera
for (let i = 0; i < 60; i++) {
  await settle(page, 0.5);
  const d = await page.evaluate(() => window.__yard.view.dist);
  if (Math.abs(d - 900) < 2) break;
}
await settle(page, 2);
await page.evaluate(() => document.fonts.ready);
const info = await page.evaluate((at) => {
  const y = window.__yard, home = y.spotAt(at);
  return { home: { x: home.x, z: home.z }, top: y.homeView() };
}, world.home.coords);

const caption = (text) => page.evaluate((t) => { const el = document.getElementById('__cap'); if (el.textContent !== t) el.textContent = t; }, text);
const extraCss = (css) => page.evaluate((c) => {
  let st = document.getElementById('__shotCss');
  if (!st) { st = document.createElement('style'); st.id = '__shotCss'; document.head.appendChild(st); }
  st.textContent = c;
}, css);
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const soft = (k) => k * k * (3 - 2 * k);
const lerp = (a, b, k) => a + (b - a) * k;
/** Ease between two camera poses; distances and zooms (`logKeys`) ease evenly to the eye. */
const lerpObj = (a, b, k, logKeys = ['dist']) => Object.fromEntries(Object.keys(a).map((key) => [key, logKeys.includes(key) ? Math.exp(lerp(Math.log(a[key]), Math.log(b[key]), k)) : lerp(a[key], b[key], k)]));

/** Put the yard camera exactly here (both where it is and where it's easing to). */
const yardCam = (v) => page.evaluate((v) => { const y = window.__yard; Object.assign(y.goal, v); Object.assign(y.view, v); }, v);
const nestCam = (v) => page.evaluate((v) => {
  const n = window.__nest3d;
  Object.assign(n.zGoal, { z: v.z, x: v.x, y: v.y }); Object.assign(n.zm, { z: v.z, x: v.x, y: v.y });
  n.goal.yaw = n.view.yaw = v.yaw; n.goal.pitch = n.view.pitch = v.pitch;
}, v);

/**
 * Capture `secs` of a shot: `cam(k)` places the camera for 0…1 through it (or null: the game moves it),
 * `caps` are [from, to, text] in seconds. Returns the frame folder and count.
 */
async function shot(name, secs, { cam = null, caps = [], pre = 2 } = {}) {
  const dir = join(TMP, name);
  mkdirSync(dir, { recursive: true });
  const n = Math.round(secs * FPS);
  if (cam) await cam(0);
  await settle(page, pre); // real time, so spots and models load at the new place
  await page.evaluate(() => window.__trailer.sync());
  for (let i = 0; i < n; i++) {
    const t = i / FPS;
    if (cam) await cam(i / (n - 1));
    const c = caps.find(([a, b]) => t >= a && t < b);
    await caption(c ? c[2] : '');
    await tick(page, 1 / FPS);
    await page.screenshot({ path: join(dir, `${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 93 });
  }
  await caption('');
  console.log('shot', name, n, 'frames');
  return { name, dir, frames: n };
}

// ---------- the shots (captured in the order the world needs, edited in the order below) ----------
const { home, top } = info;
const shots = {};
const want = (n) => !only || only === n;

// columns marching out of Red Hill, seen from just above the patch
if (want('march')) shots.march = await shot('march', V ? 2.5 : 4.5, {
  cam: (k) => yardCam(lerpObj({ x: home.x + 22, z: home.z + 8, yaw: -0.55, dist: V ? 125 : 140 }, { x: home.x + 34, z: home.z + 12, yaw: -0.3, dist: V ? 100 : 95 }, soft(k))),
  caps: [[V ? 0.2 : 0.4, 99, V ? 'Send columns out to forage and raid' : 'Send columns out to forage, herd and raid']],
});
// the same last frame without its caption: the background of the vertical cut's cards
if (V && want('march')) await page.screenshot({ path: join(TMP, 'wide.jpg'), type: 'jpeg', quality: 93 });
// cold open: at ant height beside the mound
if (want('open')) {
  await extraCss('.yard-labels{display:none!important}');
  // fresh columns at full speed, streaming out of the mound as the shot runs
  const to = { region: 1, patch: 4, spot: 4 };
  await world.send(world.home, 'transport', to, { minor_soldier: 400, media_worker: 200 }, 100);
  await world.send(world.home, 'transport', { region: 1, patch: 24, spot: 3 }, { hauler: 80, major_soldier: 60 }, 100);
  await world.send(world.home, 'transport', { region: 1, patch: 13, spot: 6 }, { acid_sprayer: 100, desert_ant: 80 }, 100);
  // beside the first column's path, a few steps out of the mound, looking across it
  const d = await page.evaluate(({ a, b }) => {
    const y = window.__yard, p = y.spotAt(a), q = y.spotAt(b), l = Math.hypot(q.x - p.x, q.z - p.z);
    return { x: (q.x - p.x) / l, z: (q.z - p.z) / l };
  }, { a: world.home.coords, b: to });
  const yaw = Math.atan2(-d.z, d.x);
  const at = (s) => ({ x: home.x + d.x * s, z: home.z + d.z * s });
  shots.open = await shot('open', V ? 2.5 : 4, {
    pre: 3,
    cam: (k) => yardCam(lerpObj({ ...at(12), yaw: yaw - 0.75, dist: 13 }, { ...at(14), yaw: yaw - 0.35, dist: 9 }, soft(k))),
    caps: [[V ? 0.5 : 1.2, 99, 'Grow an ant kingdom from a single queen']],
  });
  await extraCss('');
}
// the raid on the neighbour, acted out on the map where it was fought
if (want('battle')) {
  const ok = await page.evaluate(async () => {
    const r = await fetch('/api/reports').then((x) => x.json());
    const b = r.reports.find((x) => x.type === 'battle' && x.data?.rounds?.length > 1) ?? r.reports.find((x) => x.type === 'battle' && x.data?.rounds?.length);
    return !!b && window.__yard.playBattle(b.data);
  });
  if (!ok) throw new Error('no battle report to replay');
  await tick(page, 1 / FPS, 40); // the camera's flight in, uncaptured
  await extraCss('.yard-labels{display:none!important}');
  shots.battle = await shot('battle', V ? 3.5 : 7, { pre: 0.2, caps: [[0.3, 99, 'Raid your rivals. Haul home their dead.']] });
  await extraCss('');
  await page.evaluate(() => document.querySelector('.yard-battle .btn.ghost')?.click());
}
// from the patch out to the whole yard
if (!V && want('pullback')) shots.pullback = await shot('pullback', 5, {
  cam: (k) => yardCam(lerpObj({ x: home.x + 40, z: home.z + 20, yaw: -0.5, dist: 170 }, { x: top.x, z: top.z, yaw: 0, dist: top.dist }, ease(k))),
  caps: [[1.6, 5, 'One living world that grows while you’re away']],
});
// the same last frame without its caption: the background of the title and end cards
if (!V && want('pullback')) await page.screenshot({ path: join(TMP, 'wide.jpg'), type: 'jpeg', quality: 93 });
// inside the nest: the slab, then a chamber up close
if (want('nest') || want('nestclose')) {
  await page.evaluate(() => document.querySelector('.yard-rail button').click());
  await until(page, () => !!window.__nest3d);
  await extraCss('.nest-motion,.n3-hint,.n3-zoom,.n3-fit{display:none!important}');
  await settle(page, 3);
  if (!V && want('nest')) shots.nest = await shot('nest', 4, {
    cam: (k) => nestCam({ ...lerpObj({ z: 1, x: 0, y: 0, yaw: -0.3 }, { z: 1.25, x: 0, y: -1, yaw: 0.3 }, soft(k), ['z']), pitch: 0.16 }),
    caps: [[0.5, 4, 'Dig chambers. Raise the castes.']],
  });
  await extraCss('.nest-motion,.n3-hint,.n3-zoom,.n3-fit,.n3-labels{display:none!important}');
  if (want('nestclose')) shots.nestclose = await shot('nestclose', V ? 2.5 : 3.5, {
    cam: (k) => nestCam({ ...lerpObj({ z: 2.6, x: -9, y: 4, yaw: 0.25 }, { z: 3.3, x: -8, y: 3.5, yaw: 0.05 }, soft(k), ['z']), pitch: 0.16 }),
    caps: [[0.3, 99, V ? 'Dig chambers. Raise the castes.' : 'Every ant at work, while you’re away']],
  });
}
await page.close();
await world.stop();

if (only) {
  console.log('captured', only, 'only: frames in', join(TMP, only));
} else {
  // ---------- title and end cards, over the whole yard ----------
  const bg = readFileSync(join(TMP, 'wide.jpg')).toString('base64');
  const mark = readFileSync(join(HERE, '../../client/public/favicon.svg'), 'utf8');
  const card = async (file, { blur, lines }) => {
    const p = await browser.newPage({ viewport: { width: W, height: H } });
    await p.setContent(`<!doctype html><link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&display=swap" rel="stylesheet">
<style>html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#231a14}
.bg{position:absolute;inset:-40px;background:url(data:image/jpeg;base64,${bg}) center/cover;filter:blur(${blur}px) saturate(.85) brightness(.62)}
.c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px}
.logo{display:flex;align-items:center;gap:34px;flex-direction:${V ? 'column' : 'row'}}.logo svg{width:${V ? 220 : 150}px;height:${V ? 220 : 150}px;filter:drop-shadow(0 12px 30px rgba(0,0,0,.45))}
.word{font:800 ${V ? 200 : 190}px/1 'Bricolage Grotesque';letter-spacing:-.035em;color:#e8b23a;text-shadow:0 10px 40px rgba(0,0,0,.5)}
.tag{font:700 ${V ? 60 : 46}px/1.2 'Bricolage Grotesque';color:#f6ecd6;max-width:86%;text-align:center;text-shadow:0 4px 18px rgba(0,0,0,.6)}
.lines{display:flex;flex-direction:column;align-items:center;gap:16px;margin-top:18px}
.lines span{font:700 ${V ? 56 : 44}px/1.2 'Bricolage Grotesque';color:#f6ecd6;background:rgba(35,26,20,.82);border-left:9px solid #e8b23a;border-radius:10px;padding:10px 30px 14px}
.lines span.url{color:#231a14;background:#e8b23a;border-left-color:#f6ecd6}</style>
<div class="bg"></div><div class="c"><div class="logo">${mark}<div class="word">Hormigas</div></div>${lines}</div>`);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(500);
    await p.screenshot({ path: file, type: 'png' });
    await p.close();
  };
  await card(join(TMP, 'title.png'), { blur: 6, lines: '<div class="tag">A persistent strategy game about an ant colony</div>' });
  await card(join(TMP, 'end.png'), { blur: 14, lines: V
    ? '<div class="lines"><span>Free in your browser.</span><span>No pay-to-win.</span><span class="url">hormigas.marz.gg</span></div>'
    : '<div class="lines"><span>Free in your browser. No pay-to-win.</span><span class="url">hormigas.marz.gg</span></div>' });

  // ---------- the edit ----------
  // cue: where the music changes, relative to that piece's start
  const seq = V ? [
    { v: shots.open, cue: [0, 'idle'] }, { still: join(TMP, 'title.png'), secs: 1.5 }, { v: shots.nestclose, cue: [-0.3, 'march'] },
    { v: shots.march }, { v: shots.battle, cue: [-0.4, 'tense'] }, { still: join(TMP, 'end.png'), secs: 2.5, cue: [-0.2, 'march'] },
  ] : [
    { v: shots.open, cue: [0, 'idle'] }, { still: join(TMP, 'title.png'), secs: 2.6 }, { v: shots.nest, cue: [-0.5, 'march'] }, { v: shots.nestclose },
    { v: shots.march }, { v: shots.battle, cue: [-0.6, 'tense'] }, { v: shots.pullback, cue: [-0.3, 'march'] }, { still: join(TMP, 'end.png'), secs: 4.5 },
  ];
  const ff = (...args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  const segs = [];
  let at = 0;
  const starts = [];
  seq.forEach((s, i) => {
    const out = join(TMP, `seg${i}.mp4`);
    const secs = s.v ? s.v.frames / FPS : s.secs;
    starts.push(at);
    at += secs;
    const vin = s.v ? ['-framerate', String(FPS), '-i', join(s.v.dir, '%05d.jpg')] : ['-loop', '1', '-framerate', String(FPS), '-t', String(secs), '-i', s.still];
    const fin = V ? 0.25 : 0.35, fout = V ? 0.3 : 0.4;
    const vf = s.still ? `fade=t=in:d=${fin},fade=t=out:st=${secs - fout}:d=${fout},format=yuv420p` : i === 0 ? `fade=t=in:d=${V ? 0.3 : 0.6},format=yuv420p` : 'format=yuv420p';
    ff(...vin, '-vf', vf, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-r', String(FPS), '-pix_fmt', 'yuv420p', out);
    segs.push(out);
  });
  writeFileSync(join(TMP, 'list.txt'), segs.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'));
  ff('-f', 'concat', '-safe', '0', '-i', join(TMP, 'list.txt'), '-c', 'copy', join(TMP, 'video.mp4'));

  // music that follows the edit: quiet under the open and the title, marching from the nest on, tense for the raid
  const total = at;
  const cues = seq.flatMap((s, i) => (s.cue ? [[Math.max(0, starts[i] + s.cue[0]), s.cue[1]]] : []));
  await renderMusic(browser, url, cues, total + 1, join(TMP, 'music.wav'));
  const name = V ? 'hormigas_trailer_vertical_1080x1920' : 'hormigas_trailer_1080p30';
  mkdirSync(OUT, { recursive: true });
  ff('-i', join(TMP, 'video.mp4'), '-i', join(TMP, 'music.wav'),
    '-af', `loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st=${total - (V ? 1.5 : 2.5)}:d=${V ? 1.5 : 2.5}`, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-t', String(total), '-movflags', '+faststart', join(OUT, `${name}.mp4`));
  // a poster frame for the page that embeds it
  ff('-i', join(TMP, 'title.png'), '-q:v', '3', join(OUT, V ? `${name}_poster.jpg` : 'hormigas_trailer_poster.jpg'));
  console.log(`wrote ${name}: ${total.toFixed(1)} s`);
}

await browser.close();
await server.close();
