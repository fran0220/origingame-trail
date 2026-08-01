/* Visual acceptance shots for the game layer.
 *
 * The renderer already had a capture harness; this is the equivalent for
 * everything that was added on top of it. Each shot is a state a player
 * reaches, driven through the same helpers the journey test uses, so a change
 * that quietly breaks the viewfinder or the notebook shows up as a picture
 * rather than as a passing assertion.
 *
 * Usage:  node tools/serve.mjs &  node tools/shots.mjs [outDir]
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const OUT = process.argv[2] || 'media/game';
const URL_BASE = process.env.SHOTS_URL || 'http://localhost:8099/';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.error('pageerror:', e.message));

await page.goto(`${URL_BASE}#manual`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 180_000 });

await page.evaluate(() => {
  const g = window.__game;
  g.walker.enabled = true;
  window.__t = {
    stand(px, pz, look) {
      const w = g.walker;
      w.setAuto(null);
      w.pos.set(px, g.terrain.height(px, pz), pz);
      w.vel.set(0, 0, 0);
      const eye = { x: px, y: w.pos.y + 1.66, z: pz };
      const dx = look.x - eye.x, dy = look.y - eye.y, dz = look.z - eye.z;
      w.yaw = Math.atan2(-dx, -dz);
      w.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      this.frames(4);
    },
    key(code) { window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true })); },
    frames(n) { for (let i = 0; i < n; i++) { g.step(1 / 60); g.render(); } },
  };
});

/* Frames are stepped synchronously by the helpers above, so no wall-clock time
 * passes inside an evaluate — but every HUD element fades in over 120-450 ms of
 * real time. Without this wait the viewfinder is photographed at opacity zero,
 * which looks exactly like a viewfinder that never opened. */
/* JPEG rather than PNG: these are photographs of a jungle, they live in the
 * repository, and eight lossless 1600x900 frames is twelve megabytes of git
 * history for something a screenshot of a screenshot cannot tell apart. */
const shot = async (name) => {
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 82 });
  console.log(`${OUT}/${name}.jpg`);
};

// The loading panel fades for 800 ms and is removed 900 ms after that.
await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 10_000 });

/* 1. A tablet in situ, from reading distance. */
await page.evaluate(() => {
  const g = window.__game;
  const it = g.session.glyphs.items.find((i) => i.id === 'first-channel');
  const yaw = it.mesh.rotation.y;
  window.__t.stand(it.position.x + Math.sin(yaw) * 1.7, it.position.z + Math.cos(yaw) * 1.7, it.focus);
});
await shot('01-tablet');

/* 2. The same tablet rubbed: prompt, toast, counter and the sun stepping. */
await page.evaluate(() => { window.__t.key('KeyE'); window.__t.frames(6); });
await shot('02-rubbing');

/* 3. The viewfinder locked onto the temple gateway. */
await page.evaluate(() => {
  const g = window.__game;
  const s = g.session.photo.byId('gateway');
  const d = g.session.photo.idealDistanceFor(s);
  window.__t.stand(s.focus.x + d * 0.75, s.focus.z + d * 0.66, s.focus);
  window.__t.key('KeyF');
  window.__t.frames(24);
});
await shot('03-viewfinder');

/* 4. The falls through the lens, which is the shot the level is built toward. */
await page.evaluate(() => {
  const g = window.__game;
  const s = g.session.photo.byId('falls');
  const d = g.session.photo.idealDistanceFor(s);
  window.__t.stand(s.focus.x + d * 0.15, s.focus.z + d * 0.99, s.focus);
  window.__t.frames(10);
  g.canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
  window.__t.frames(4);
});
await shot('04-falls-shot');

/* 5. The notebook, with one plate in it. */
await page.evaluate(() => { window.__t.key('KeyF'); window.__t.frames(20); window.__t.key('Tab'); });
await page.evaluate(() => document.querySelector('#book .tabs button[data-tab="photo"]').click());
await shot('05-notebook-photos');

await page.evaluate(() => document.querySelector('#book .tabs button[data-tab="glyph"]').click());
await shot('06-notebook-glyphs');

/* 6. The finale, reached the way a player reaches it: the last tablet. */
await page.evaluate(async () => {
  const g = window.__game;
  window.__t.key('Tab');
  window.__t.frames(2);
  const it = g.session.glyphs.items.find((i) => i.id === 'last');
  const yaw = it.mesh.rotation.y;
  window.__t.stand(it.position.x + Math.sin(yaw) * 1.7, it.position.z + Math.cos(yaw) * 1.7, it.focus);
  window.__t.key('KeyE');
  window.__t.frames(6);
});
await page.waitForTimeout(500);
await shot('07-finale');

await browser.close();
