/* The portal cover image.
 *
 * A frame of the game with the HUD switched off, taken from a place the player
 * actually walks through, at the sun angle a run is roughly halfway through.
 * Rendering it rather than cropping a screenshot means the cover is 16:9 at
 * whatever size the portal wants and can be regenerated after any art change.
 *
 * Usage:  node tools/serve.mjs &  node tools/cover.mjs [outFile]
 */
import { chromium } from 'playwright';

const OUT = process.argv[2] || 'media/cover.jpg';
const URL_BASE = process.env.SHOTS_URL || 'http://localhost:8099/';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.error('pageerror:', e.message));

await page.goto(`${URL_BASE}#manual`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 180_000 });
await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 12_000 });

await page.evaluate(() => {
  const g = window.__game;
  document.getElementById('hud').style.display = 'none';
  g.walker.enabled = true;
  // Mid-afternoon: the six-record sun, which is the light most of a run is
  // played in and the one the light shafts read best under.
  g.setSun(27, 169);

  /* The falls, from the pool. It is the one view in the level that is legible
   * at thumbnail size — everywhere else is high-frequency green that turns to
   * mush the moment the portal scales it down. */
  const s = g.session.photo.byId('falls');
  const d = g.session.photo.idealDistanceFor(s);
  const w = g.walker;
  w.setAuto(null);
  const px = s.focus.x + d * 0.15, pz = s.focus.z + d * 0.99;
  w.pos.set(px, g.terrain.height(px, pz), pz);
  w.vel.set(0, 0, 0);
  const eye = { x: px, y: w.pos.y + 1.66, z: pz };
  const dx = s.focus.x - eye.x, dy = s.focus.y - eye.y, dz = s.focus.z - eye.z;
  w.yaw = Math.atan2(-dx, -dz);
  w.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  for (let i = 0; i < 30; i++) { g.step(1 / 60); g.render(); }
});

await page.waitForTimeout(300);
// The portal caps a cover at 2 MB and scales it down for the card; a lossless
// 1600x900 jungle frame is over that on its own.
await page.screenshot({ path: OUT, type: 'jpeg', quality: 88 });
console.log(OUT);
await browser.close();
