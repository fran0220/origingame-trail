/* Boot smoke test.
 *
 * Loads the page in a real GPU-backed Chromium, waits for the world to finish
 * building, and reports what the game layer actually produced: how many
 * tablets stand in the scene, how many photographic subjects resolved, and
 * whether anything threw on the way. It fails on the first console error
 * rather than at the end, because a page that logs a WebGL error and then
 * carries on is exactly the case a screenshot would pass.
 *
 * Usage:  node tools/serve.mjs &  node tools/smoke.mjs
 */
import { chromium } from 'playwright';

const URL_BASE = process.env.SMOKE_URL || 'http://localhost:8099/';
const TIMEOUT = Number(process.env.SMOKE_TIMEOUT || 120_000);

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=default',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(`${URL_BASE}#manual`, { waitUntil: 'domcontentloaded' });

try {
  await page.waitForFunction(() => !!window.__game, null, { timeout: TIMEOUT });
} catch {
  console.error('world never finished building');
  for (const e of errors) console.error('  ', e);
  await browser.close();
  process.exit(1);
}

await page.evaluate(() => window.__game.begin());
await page.waitForTimeout(1500);

const report = await page.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  return {
    fps: Math.round(g.fps),
    tier: g.tier,
    info: g.info(),
    tablets: s.glyphs.items.length,
    subjects: s.photo.subjects.length,
    // Resolved positions prove the anchors found real geometry rather than
    // silently collapsing onto the trail centre line.
    tabletsAt: s.glyphs.items.map((i) => [i.id, +i.position.x.toFixed(1), +i.position.z.toFixed(1)]),
    subjectsAt: s.photo.subjects.map((i) => [i.id, +i.focus.x.toFixed(1), +i.focus.y.toFixed(1), +i.focus.z.toFixed(1)]),
    hudVisible: !document.getElementById('hud').classList.contains('hidden'),
    chapter: document.querySelector('#chapter .c').textContent,
  };
});

console.log(JSON.stringify(report, null, 2));

await page.screenshot({ path: 'media/smoke.png' });

if (errors.length) {
  console.error(`\n${errors.length} console error(s):`);
  for (const e of errors) console.error('  ', e);
  await browser.close();
  process.exit(1);
}

await browser.close();
console.log('\nok');
