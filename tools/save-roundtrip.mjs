/* Save round-trip: does a walk survive a reload?
 *
 * Collects a couple of records in one page, reloads, and asserts the second
 * page comes back with the same notebook, the same clock and the walker
 * standing where the first one left it. This is the one test that has to use
 * two page loads: serialise/restore in a single session proves nothing about
 * whether the write ever reached storage.
 *
 * The platform save is exercised through the same adapter the game uses, which
 * on a local server falls through to localStorage — so this covers the offline
 * path exactly. The cloud path is the same code with one await in front of it.
 *
 * Usage:  node tools/serve.mjs &  node tools/save-roundtrip.mjs
 */
import { chromium } from 'playwright';

const URL_BASE = process.env.SAVE_URL || 'http://localhost:8099/';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const setup = async () => {
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
        w.yaw = Math.atan2(-(look.x - eye.x), -(look.z - eye.z));
        w.pitch = Math.atan2(look.y - eye.y, Math.hypot(look.x - eye.x, look.z - eye.z));
        for (let i = 0; i < 4; i++) { g.step(1 / 60); g.render(); }
      },
      key(code) { window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true })); },
    };
  });
};

await page.goto(`${URL_BASE}#manual`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await setup();

const before = await page.evaluate(async () => {
  const g = window.__game;
  const s = g.session;
  for (const id of ['first-channel', 'naming', 'into-the-hall']) {
    const it = s.glyphs.items.find((i) => i.id === id);
    const yaw = it.mesh.rotation.y;
    window.__t.stand(it.position.x + Math.sin(yaw) * 1.6, it.position.z + Math.cos(yaw) * 1.6, it.focus);
    window.__t.key('KeyE');
  }
  // Pretend a few minutes of walking happened, so the clock has something to
  // survive; the elapsed field is what the leaderboard tie-breaks on.
  s.state.elapsedMs = 214_000;
  // Flush rather than wait out the debounce: the point of the test is the
  // storage round trip, not the timer.
  await s.state.flush();
  return {
    glyphs: [...s.state.glyphs].sort(),
    t: +s.state.furthestT.toFixed(4),
    where: s.state.where,
    elapsedMs: s.state.elapsedMs,
    sunStep: s.state.sunStep,
  };
});

/* reload(), not goto(). Navigating to the URL the page is already on differs
 * only in the fragment, which the browser resolves as a same-document
 * navigation: the old JavaScript objects survive and the test passes on a save
 * system that never wrote anything. */
await page.reload({ waitUntil: 'domcontentloaded' });
await setup();

const after = await page.evaluate(() => {
  const s = window.__game.session.state;
  const p = window.__game.walker.pos;
  return {
    glyphs: [...s.glyphs].sort(),
    t: +s.furthestT.toFixed(4),
    elapsedMs: s.elapsedMs,
    sunStep: s.sunStep,
    restored: s.restored,
    counter: document.querySelector('#cGlyph b').textContent,
    walker: { x: +p.x.toFixed(2), z: +p.z.toFixed(2) },
    yaw: +window.__game.walker.yaw.toFixed(3),
  };
});

const problems = [];
if (after.glyphs.join(',') !== before.glyphs.join(',')) problems.push(`glyphs ${after.glyphs} != ${before.glyphs}`);
if (Math.abs(after.elapsedMs - before.elapsedMs) > 1500) problems.push(`elapsed ${after.elapsedMs} != ${before.elapsedMs}`);
if (after.sunStep !== before.sunStep) problems.push(`sunStep ${after.sunStep} != ${before.sunStep}`);
if (!after.restored) problems.push('restored flag not set');
if (after.counter !== `${before.glyphs.length}/12`) problems.push(`counter shows ${after.counter}`);
// The walker stands where the save left them, to the metre, rather than being
// snapped back onto the trail centre line.
const drift = Math.hypot(after.walker.x - before.where.x, after.walker.z - before.where.z);
if (drift > 1) problems.push(`walker drifted ${drift.toFixed(2)} m from the saved position`);
if (Math.abs(after.yaw - before.where.yaw) > 0.02) problems.push(`facing ${after.yaw} != saved ${before.where.yaw}`);

console.log(JSON.stringify({ before, after, problems, errors }, null, 2));
await browser.close();

if (problems.length || errors.length) {
  console.error(`\nFAILED: ${problems.length} mismatch(es), ${errors.length} page error(s)`);
  process.exit(1);
}
console.log('\nok — the walk survives a reload');
