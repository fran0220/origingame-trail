/* Do plants actually touch the ground they claim to be rooted in?
 *
 * Scatter samples terrain height at the jittered point, so in principle every
 * instance origin sits a deliberate few centimetres below grade. This asserts
 * that against the shipped scene rather than the intent: every InstancedMesh
 * under the vegetation root is decomposed, deduped (leaf and wood buckets
 * share matrices), and each origin's y is compared with the terrain — or the
 * masonry perch, where one stands above the soil — directly under it.
 *
 * Usage:  node tools/serve.mjs &  node tools/floatcheck.mjs
 */
import { chromium } from 'playwright';

const URL_BASE = process.env.MAP_URL || 'http://localhost:8099/';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${URL_BASE}#manual`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 180_000 });

const result = await page.evaluate(() => {
  const g = window.__game;
  const T = window.THREE;
  const t = g.terrain, ruins = g.ruins;
  const pos = new T.Vector3(), quat = new T.Quaternion(), scl = new T.Vector3();
  const m = new T.Matrix4();

  const perSpecies = {};
  g.veg.root.updateMatrixWorld(true);
  g.veg.root.traverse((o) => {
    if (!o.isInstancedMesh) return;
    let name = o.name;
    for (let p = o.parent; p && !name; p = p.parent) name = p.name;
    if (name === 'vegetation' || !name) name = '?';
    const rec = perSpecies[name] ||= { seen: new Set(), dys: [], worst: [] };
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      m.premultiply(o.matrixWorld);
      m.decompose(pos, quat, scl);
      const key = `${pos.x.toFixed(2)},${pos.y.toFixed(2)},${pos.z.toFixed(2)}`;
      if (rec.seen.has(key)) continue;
      rec.seen.add(key);
      let gy = t.height(pos.x, pos.z);
      if (ruins) {
        const p = ruins.perchAt(pos.x, pos.z);
        if (p > -1e8 && p > gy) gy = p;
      }
      const dy = pos.y - gy;
      rec.dys.push(dy);
      if (dy > 0.12 || dy < -0.60) {
        rec.worst.push({ x: +pos.x.toFixed(1), y: +pos.y.toFixed(2),
                         z: +pos.z.toFixed(1), dy: +dy.toFixed(3),
                         s: +scl.y.toFixed(2) });
      }
    }
  });

  const rows = [];
  for (const [name, rec] of Object.entries(perSpecies)) {
    const dys = rec.dys;
    if (!dys.length) continue;
    dys.sort((a, b) => a - b);
    const q = (f) => dys[Math.min(dys.length - 1, (dys.length * f) | 0)];
    rows.push({
      name, n: dys.length,
      min: +dys[0].toFixed(3), p50: +q(0.5).toFixed(3),
      p99: +q(0.99).toFixed(3), max: +dys[dys.length - 1].toFixed(3),
      floating: dys.filter((d) => d > 0.12).length,
      buried: dys.filter((d) => d < -0.60).length,
      worst: rec.worst.sort((a, b) => Math.abs(b.dy) - Math.abs(a.dy)).slice(0, 4),
    });
  }
  rows.sort((a, b) => (b.floating + b.buried) - (a.floating + a.buried));
  return rows;
});

for (const r of result) {
  const flag = (r.floating || r.buried) ? '  <<<' : '';
  console.log(
    `${r.name.padEnd(10)} n=${String(r.n).padStart(6)}  ` +
    `dy min=${r.min} p50=${r.p50} p99=${r.p99} max=${r.max}  ` +
    `float=${r.floating} buried=${r.buried}${flag}`);
  for (const w of r.worst) {
    console.log(`    at (${w.x}, ${w.z}) y=${w.y} dy=${w.dy} scale=${w.s}`);
  }
}
if (errors.length) console.log('PAGE ERRORS:', errors);
await browser.close();
