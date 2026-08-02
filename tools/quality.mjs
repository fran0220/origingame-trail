/* The quality picker, checked against the renderer rather than the button.
 *
 * Four tiers existed from the beginning and were reachable only by typing one
 * into the URL hash, which meant ultra shipped unreachable: the adaptive step
 * only ever steps *down*, on purpose, so no machine was ever offered the tier
 * it could carry. The picker in the pause menu is the way to ask.
 *
 * A picker is exactly the kind of feature that passes a shallow test while
 * doing nothing — highlighting a button is one line and changing the shadow
 * map is another — so nothing here looks at the button. Each assertion reads
 * the renderer's own state: the pixel ratio it is drawing at and the size of
 * the shadow map it allocated.
 *
 * Usage:  node tools/serve.mjs &  node tools/quality.mjs
 */
import { chromium } from 'playwright';

const URL_BASE = process.env.QUALITY_URL || 'http://localhost:8099/';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const failures = [];
const seen = [];

await page.goto(`${URL_BASE}#manual`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 300_000 });
await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 15_000 });

const read = () => page.evaluate(() => ({
  tier: window.__game.tier,
  pinned: window.__game.pinnedTier,
  dpr: window.__game.renderer.getPixelRatio(),
  shadow: window.__game.sun.shadow.mapSize.x,
  saved: (() => { try { return localStorage.getItem('jt.tier'); } catch { return null; } })(),
}));

// The pause overlay has to be up for the picker to be clickable at all.
await page.evaluate(() => window.__game.setPaused?.(true) ?? window.__game.hud.setPaused(true));

/* Every tier, in an order that crosses in both directions — a picker that only
 * ever raises quality would pass a monotonically increasing sweep. */
for (const tier of ['low', 'ultra', 'medium', 'high', 'low']) {
  await page.click(`#qTiers button[data-tier="${tier}"]`);
  await page.waitForTimeout(120);
  const s = await read();
  seen.push({ asked: tier, ...s });
  if (s.tier !== tier) failures.push(`asked for ${tier}, renderer reports ${s.tier}`);
  if (s.saved !== tier) failures.push(`asked for ${tier}, persisted ${s.saved}`);
}

/* Shadow map and pixel ratio have to differ across the range, or the tiers are
 * a label on nothing. */
const low = seen.find((s) => s.asked === 'low');
const ultra = seen.find((s) => s.asked === 'ultra');
if (!(ultra.shadow > low.shadow)) {
  failures.push(`shadow map did not grow with the tier: low ${low.shadow}, ultra ${ultra.shadow}`);
}
if (!(ultra.dpr > low.dpr)) {
  failures.push(`pixel ratio did not grow with the tier: low ${low.dpr}, ultra ${ultra.dpr}`);
}

// The choice outlives the tab.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 300_000 });
const afterReload = await read();
if (afterReload.tier !== 'low') {
  failures.push(`after reload the pinned tier was ${afterReload.tier}, not low`);
}

// And 'auto' gives control back rather than pinning a fifth value.
await page.evaluate(() => window.__game.hud.setPaused(true));
await page.click('#qTiers button[data-tier="auto"]');
await page.waitForTimeout(120);
const auto = await read();
if (auto.pinned) failures.push(`auto left the tier pinned to ${auto.pinned}`);
if (auto.saved) failures.push(`auto left ${auto.saved} in storage`);

console.log(JSON.stringify({ seen, afterReload, auto, failures, errors }, null, 1));
await browser.close();

if (failures.length || errors.length) {
  console.error('\nfailed — the quality picker does not move the renderer');
  process.exit(1);
}
console.log('\nok — every tier reaches the renderer and outlives a reload');
