// Stills of the 3D nest and of the latest battle replay, to plan shots: node tools/trailer/scout-nest.mjs
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, launch, openGame, settle, startClient, tick } from './lib.mjs';
import { HIDE, LOCAL } from './shots.mjs';

const dir = join(HERE, 'cache', 'scout', `nest-${Date.now()}`);
mkdirSync(dir, { recursive: true });
const { server, url } = await startClient();
const browser = await launch();
const page = await openGame(browser, url, { local: LOCAL });
await page.evaluate((css) => { window.__TRAILER_HIDE = css; window.__trailer.chrome('none'); }, HIDE);
await page.waitForFunction(() => window.__yard, null, { timeout: 60000, polling: 250 });
await settle(page, 4);
let i = 0;
const shot = async (name) => {
  const f = join(dir, `${String(i++).padStart(2, '0')}_${name}.jpg`);
  await page.screenshot({ path: f, type: 'jpeg', quality: 85 });
  console.log(f);
};

// the battle: the newest report with rounds, acted out on the map
const rep = await page.evaluate(async () => {
  const r = await fetch('/api/reports').then((x) => x.json());
  const b = r.reports.filter((x) => x.type === 'battle' && x.data?.rounds?.length).sort((a, b) => b.data.rounds.length - a.data.rounds.length)[0];
  if (!b) return null;
  window.__yard.playBattle(b.data);
  return { title: b.title, rounds: b.data.rounds.length };
});
console.log('battle', rep);
if (rep) for (let s = 2; s <= 14; s += 2) {
  await tick(page, 1 / 30, 60);
  await shot(`battle${s}s`);
}

// the nest: the rail's first button opens it
await page.evaluate(() => document.querySelector('.yard-rail button').click());
await page.waitForFunction(() => window.__nest3d, null, { timeout: 60000, polling: 250 });
await settle(page, 4);
for (const [z, x, y, yaw] of [[1, 0, 0, 0.3], [1, 0, 0, -0.4], [2.5, -8, 4, 0.2], [4, 6, -6, 0.1], [7, -10, 6, 0.1]]) {
  await page.evaluate((v) => { const n = window.__nest3d; Object.assign(n.zGoal, { z: v.z, x: v.x, y: v.y }); Object.assign(n.zm, { z: v.z, x: v.x, y: v.y }); n.goal.yaw = n.view.yaw = v.yaw; }, { z, x, y, yaw });
  await settle(page, 1.5);
  await shot(`nest_z${z}`);
}
await browser.close();
await server.close();
