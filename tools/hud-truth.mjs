/* The overlay, composited — which is the only way this can be checked.
 *
 * Every other capture tool in this repo photographs the WebGL canvas, and the
 * HUD is DOM sitting on top of it. That gap is not academic: the driving
 * readout and the minimap were both authored to the bottom-right corner,
 * independently and correctly, and together they put a 58-pixel speed straight
 * through the middle of the map. Eleven passing tests and a folder of gallery
 * shots had nothing to say about it.
 *
 * So this one asserts on layout rather than on pixels — that the widgets which
 * must not overlap do not, that a driven level offers keys that exist, and
 * that the numbers a driver reads are actually being written.
 */
import { chromium } from 'playwright';
import { serve } from './harness.mjs';

const fail = [];
const check = (c, m) => { if (!c) fail.push(m); };
const overlap = (a, b) => !!(a && b
  && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom);

const server = serve(); await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({ headless: true, args: [
  '--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });

try {
  await page.goto(`${base}#manual&tier=high&level=lake`);
  await page.waitForFunction(() => !!window.__game, null, { timeout: 300_000 });
  await page.evaluate(() => { window.__game.begin(); window.__game.hud.bootDone(); });

  /* Drive far enough to bank a split, so the readout is showing real values
   * rather than its initial state. */
  await page.evaluate(() => {
    const g = window.__game, d = g.walker, trail = g.trail, THREE = window.THREE;
    const P = new THREE.Vector3();
    for (let n = 0; n < 60 * 40; n++) {
      const q = trail.nearest(d.pos.x, d.pos.z, {});
      if (q.t > 0.30) break;
      trail.pointAt(Math.min(1, q.t + 0.018), P);
      const want = Math.atan2(P.x - d.pos.x, P.z - d.pos.z);
      let e = want - d.yaw;
      while (e > Math.PI) e -= Math.PI * 2;
      while (e < -Math.PI) e += Math.PI * 2;
      d.keys.KeyA = e < -0.012; d.keys.KeyD = e > 0.012;
      d.keys.KeyW = !(Math.abs(e) > 0.055 || d.speed > 26);
      g.step(1 / 60);
    }
  });

  const box = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    return el.getBoundingClientRect().toJSON();
  }, sel);

  const ui = await page.evaluate(() => {
    const t = (s) => document.querySelector(s)?.textContent ?? null;
    return {
      driving: document.querySelector('#hud').classList.contains('driving'),
      raceShown: !document.querySelector('#race').classList.contains('hidden'),
      speed: t('#rSpeed'), time: t('#rTime'), split: t('#rSplit'), gate: t('#rGate'),
    };
  });

  check(ui.driving, 'the overlay is not in its driving layout on a driven level');
  check(ui.raceShown, 'the driving readout is hidden');
  check(/^\d+$/.test(ui.speed || ''), `speed reads "${ui.speed}"`);
  check(+ui.speed > 5, `speed reads ${ui.speed} km/h after driving 300 m`);
  check(/^\d:\d\d\.\d\d$/.test(ui.time || ''), `clock reads "${ui.time}"`);
  check(ui.time !== '0:00.00', 'the clock never started');
  check(/^[1-5]\/5$/.test(ui.split || ''), `split counter reads "${ui.split}"`);

  const race = await box('#race'), map = await box('#map');
  const walk = await box('#hints'), drive = await box('#hintsDrive');
  check(!overlap(race, map), 'the driving readout overlaps the minimap');
  check(!overlap(race, drive), 'the driving readout overlaps the control hints');
  check(drive, 'the driving control hints are not shown');
  check(!walk, 'the walking control hints are still shown on a driven level');
  /* The photographic layer belongs to the walked game and is a lie about what
   * a timed stage scores. */
  check(!await box('#counters'), 'the photographic counters are shown while driving');

  /* And the same overlay, on the level that is walked, must be unchanged. */
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await p2.goto(`${base}#manual&tier=high&level=jungle`);
  await p2.waitForFunction(() => !!window.__game, null, { timeout: 300_000 });
  await p2.evaluate(() => { window.__game.begin(); window.__game.hud.bootDone(); });
  const jungle = await p2.evaluate(() => ({
    driving: document.querySelector('#hud').classList.contains('driving'),
    race: !document.querySelector('#race').classList.contains('hidden'),
    walk: getComputedStyle(document.querySelector('#hints')).display !== 'none',
    drive: getComputedStyle(document.querySelector('#hintsDrive')).display !== 'none',
    counters: !!document.querySelector('#counters'),
  }));
  check(!jungle.driving, 'the walked level is in the driving layout');
  check(!jungle.race, 'the driving readout is shown on the walked level');
  check(jungle.walk, 'the walked level lost its control hints');
  check(!jungle.drive, 'the walked level shows driving control hints');
  check(jungle.counters, 'the walked level lost its collection counters');
  await p2.close();

  for (const e of errs) fail.push(e);

  console.log(`  driving    speed ${ui.speed} km/h   clock ${ui.time}   ${ui.split}`);
  console.log(`  layout     race/map clear, hints swapped, counters hidden`);
} finally {
  await browser.close();
  server.close();
}

if (fail.length) {
  console.error('FAILED');
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('ok — the overlay matches the verb the level is played with');
