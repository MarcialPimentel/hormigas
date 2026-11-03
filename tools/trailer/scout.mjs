// Look around the trailer world: stills of the Whole Yard from a list of camera spots, to plan shots.
//   node tools/trailer/scout.mjs [x,z,yaw,dist ...]   -> tools/trailer/cache/scout/*.jpg
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, launch, openGame, settle, startClient, tick } from './lib.mjs';
import { HIDE, LOCAL } from './shots.mjs';

const dir = join(HERE, 'cache', 'scout', String(Date.now()));
mkdirSync(dir, { recursive: true });
const { server, url } = await startClient();
const browser = await launch();
const page = await openGame(browser, url, { local: LOCAL });
await page.evaluate((css) => { window.__TRAILER_HIDE = css; window.__trailer.chrome('none'); }, HIDE);
await page.waitForFunction(() => window.__yard, null, { timeout: 60000, polling: 250 });
await settle(page, 6);
const info = await page.evaluate(() => {
  const y = window.__yard;
  const home = y.spotAt({ region: 1, patch: 1, spot: 5 });
  return { view: { ...y.view }, top: y.homeView(), home: { x: home.x, z: home.z }, t11: y.tileAt(1, 1), t12: y.tileAt(1, 2), t13: y.tileAt(1, 3) };
});
console.log(JSON.stringify(info));
const spots = process.argv.slice(2).map((s) => s.split(',').map(Number));
if (!spots.length) {
  const { x, z } = info.home;
  spots.push([info.top.x, info.top.z, 0, info.top.dist], [info.top.x, info.top.z, -0.4, 1800], [info.view.x, info.view.z, 0, info.view.dist], [x, z, -0.3, 900], [x, z, -0.3, 300], [x, z, -0.3, 140], [x, z, 0.4, 60], [x, z, 0.4, 20]);
}
let i = 0;
for (const [x, z, yaw, dist] of spots) {
  await page.evaluate((v) => { const y = window.__yard; Object.assign(y.goal, v); Object.assign(y.view, v); }, { x, z, yaw, dist });
  await settle(page, 2.5);
  await tick(page, 1 / 30, 3);
  const f = join(dir, `${String(i++).padStart(2, '0')}_${Math.round(dist)}.jpg`);
  await page.screenshot({ path: f, type: 'jpeg', quality: 85 });
  console.log(f);
}
await browser.close();
await server.close();
