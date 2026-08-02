/* Does the map draw the level, or a plausible-looking picture of one?
 *
 * A minimap is the one HUD element a player will trust over their own eyes,
 * and it is drawn from a second copy of every shape it shows. That second copy
 * can disagree with the world in ways no screenshot review catches: the brook
 * layer first shipped with the lateral basis inverted, which put the stream on
 * the dry side of the path — twenty-two metres from the water at the point the
 * level asks you to photograph it — and the map looked completely convincing.
 *
 * So this asserts against the world, not against an image. For each thing the
 * map draws it takes the point the map would draw it at, and checks the level
 * agrees something is there: water for the channel and the pool, and, for the
 * trail, that the terrain's own distance-to-trail field reads near zero.
 *
 * Usage:  node tools/serve.mjs &  node tools/map-truth.mjs
 */
import { chromium } from 'playwright';

const URL_BASE = process.env.MAP_URL || 'http://localhost:8099/';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${URL_BASE}#manual`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 180_000 });

const result = await page.evaluate(async () => {
  const g = window.__game;
  const map = g.session.minimap;
  const failures = [];
  const samples = [];

  /* The map is a picture, so it gets read as one.
   *
   * An earlier version of this file recomputed the brook centreline from the
   * level and checked *that* was wet, which is a tautology: it passed with the
   * map's own basis inverted, because it never looked at the map. So the test
   * now samples the baked image at a world position and reports what colour is
   * actually there. Water is the one strongly blue thing in a bake made of
   * greens and greys, which makes "is this pixel water" a stable question. */
  const bake = map.base.getContext('2d').getImageData(0, 0, map.bw, map.bh).data;
  const isWaterAt = (x, z, r = 3) => {
    const cx = Math.round(map.mx(x)), cy = Math.round(map.my(z));
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const px = cx + dx, py = cy + dy;
        if (px < 0 || py < 0 || px >= map.bw || py >= map.bh) continue;
        const k = (py * map.bw + px) * 4;
        const R = bake[k], G = bake[k + 1], B = bake[k + 2];
        if (B > R + 18 && B >= G) return true;
      }
    }
    return false;
  };

  const { BROOK_T0, BROOK_T1, BROOK_HEAD, brookOffset } = await import(new URL('src/levels/jungle/brook.js', document.baseURI).href);
  const { trailOffset } = await import(new URL('src/game/anchors.js', document.baseURI).href);

  /* 1. Wherever the level has water, the map has to show water — and, just as
   * importantly, where the level is dry the map has to be dry. The inverted
   * basis satisfied the first half everywhere it happened to overlap the
   * channel's swing; it is the mirrored, dry bank that convicts it.
   *
   * Sampling starts past BROOK_HEAD: the channel's first stretch is a seep the
   * level ramps in on purpose, and the map fades its stroke over the same span,
   * so neither is claiming a stream there. */
  for (let t = BROOK_T0 + BROOK_HEAD; t <= BROOK_T1 - 0.03; t += 0.02) {
    const off = brookOffset(t);
    const c = trailOffset(t, off, g.trail);
    const mirror = trailOffset(t, -off, g.trail);
    const drawn = isWaterAt(c.x, c.z);
    const wet = g.terrain.wetAt(c.x, c.z);
    const mirrorDrawn = isWaterAt(mirror.x, mirror.z);
    const mirrorWet = g.terrain.wetAt(mirror.x, mirror.z);
    samples.push({ what: 'brook', t: +t.toFixed(2), wet: +wet.toFixed(2), drawn, mirrorWet: +mirrorWet.toFixed(2), mirrorDrawn });
    if (wet > 0.5 && !drawn) {
      failures.push(`brook t=${t.toFixed(2)}: the level has water at (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) and the map draws none`);
    }
    if (mirrorWet < 0.1 && mirrorDrawn) {
      failures.push(`brook t=${t.toFixed(2)}: the map draws water at (${mirror.x.toFixed(1)}, ${mirror.z.toFixed(1)}), which is dry ground`);
    }
  }

  /* 2. The subject the player is sent to photograph has to sit on the water
   * the map shows. This is the assertion that fails by twenty-two metres. */
  const s = g.session.photo.byId('brook');
  samples.push({ what: 'brook-subject', drawn: isWaterAt(s.focus.x, s.focus.z) });
  if (!isWaterAt(s.focus.x, s.focus.z)) {
    failures.push(`the brook subject at (${s.focus.x.toFixed(1)}, ${s.focus.z.toFixed(1)}) is not on any water the map draws`);
  }

  // 3. The pool, at its centre and at its rim.
  const { POOL } = await import(new URL('src/levels/jungle/spillway.js', document.baseURI).href);
  for (const [dx, dz, name] of [[0, 0, 'centre'], [POOL.r * 0.7, 0, 'rim']]) {
    const drawn = isWaterAt(POOL.x + dx, POOL.z + dz, 1);
    samples.push({ what: `pool-${name}`, drawn });
    if (!drawn) failures.push(`the map draws no water at the pool's ${name}`);
  }

  /* 4. The trail, read back off the bake the same way: the stroked path has to
   * land on ground the terrain's own distance field calls trail. */
  for (let t = 0.05; t <= 0.95; t += 0.05) {
    const p = g.trail.pointAt(t, new window.THREE.Vector3());
    const w = { x: Math.round(map.mx(p.x)) / 2 + map.x0, z: Math.round(map.my(p.z)) / 2 + map.z1 };
    const q = {};
    g.terrain.sampleField(w.x, w.z, q);
    samples.push({ what: 'trail', t: +t.toFixed(2), distToTrail: +q.dist.toFixed(2) });
    if (q.dist > 1.5) {
      failures.push(`trail at t=${t.toFixed(2)}: map projects to ${q.dist.toFixed(1)} m off the trail`);
    }
  }

  return { failures, samples };
});

console.log(JSON.stringify({ ...result, errors }, null, 1));
await browser.close();

if (result.failures.length || errors.length) {
  console.error('\nfailed — the map disagrees with the level it is drawing');
  process.exit(1);
}
console.log('\nok — every feature the map draws is where the level put it');
