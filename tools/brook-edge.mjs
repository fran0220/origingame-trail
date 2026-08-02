/* Does the stream reach its own banks?
 *
 * The brook is authored twice over, and it has already cost this project one
 * shipped bug: terrain.js cut the channel from one reference and water.js laid
 * the surface from another, the two differed by metres, and two hundred metres
 * of river drew nothing at all. That one was about the *centreline*. This is
 * the same fault in the other axis.
 *
 * The channel's cross-section is not a trough with vertical sides. `Brook.cut`
 * holds the floor flat out to `half + 0.55` and only then starts the bank,
 * which climbs 1.8 m over 2.1 m — so the ground does not come back up to the
 * water's own surface until well over a metre outside `half`. Build the
 * surface ribbon to `half` and it stops in the middle of the stream, at eighty
 * centimetres of depth, with a straight polygonal edge and full opacity.
 * Nothing downstream can rescue that: the material fades alpha with depth, and
 * at the edge of a mesh that never reaches shallow water there is no shallow
 * water to fade in.
 *
 * So this asserts two things against the terrain that was actually carved,
 * reading the geometry that was actually built:
 *
 *   1. Edge depth. Every vertex on either rim of the ribbon must be within a
 *      few centimetres of dry. The mesh already carries the ground height it
 *      was built over in `aBed`, so this compares the artifact with itself.
 *   2. Coverage. Marching outward from the centreline, the first place the
 *      ground rises through the water's surface is the waterline. The ribbon
 *      must reach most of the way there, or there is open channel with no
 *      water in it.
 *
 * Usage:  node tools/serve.mjs &  node tools/brook-edge.mjs
 */
import { chromium } from 'playwright';

const URL_BASE = process.env.BROOK_URL || 'http://localhost:8099/';

/* A waterline is where depth reaches zero, so the tolerance is what counts as
 * zero. Three centimetres is under the terrain's own 0.5 m sample spacing
 * interpolated across a bank that climbs at nearly 1:1, and it is far below
 * the depth at which the surface material still paints an opaque sheet. */
const EDGE_TOL = 0.09;
/* How much of the wetted cross-section the ribbon has to cover. Not 1.0: the
 * last few centimetres before the waterline are a wedge thinner than the
 * terrain grid can resolve, and chasing them buys nothing the alpha ramp is
 * not already doing. */
const COVER_MIN = 0.88;
/* Stations are allowed to fail this only where the carve itself is feathered
 * out — the first and last of the run, where there is deliberately no channel. */
const FAIL_BUDGET = 0.06;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${URL_BASE}#manual`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 180_000 });
await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 120_000 });

const result = await page.evaluate(async ({ EDGE_TOL, COVER_MIN }) => {
  const g = window.__game;
  const T = g.terrain;
  const mesh = g.water.brookMesh;
  if (!mesh) return { fatal: 'no brookMesh' };

  const pos = mesh.geometry.getAttribute('position');
  const bed = mesh.geometry.getAttribute('aBed');
  if (!bed) return { fatal: 'no aBed attribute' };

  /* The ribbon's own grid, recovered from the geometry rather than assumed:
   * one row per station, W vertices across. The station count comes from the
   * brook's own build range, so a change to either end of the run is picked
   * up here instead of silently reindexing the test. */
  const B = T.brook;
  const rows = B.i1 - B.i0 + 1;
  const W = pos.count / rows;
  if (!Number.isInteger(W) || W < 2) {
    return { fatal: `geometry is ${pos.count} vertices, not a multiple of ${rows} stations` };
  }

  const { poolBed, POOL_Y } = await import(new URL('src/world/spillway.js', document.baseURI).href);

  const edge = [];   // depth at the two rim vertices of each station
  const drowned = []; // stations the basin continues, exempt from the rim rule
  const cover = [];  // ribbon half-width as a fraction of the wetted half-width
  const samples = [];

  for (let j = 0; j < rows; j++) {
    const st = B.st[B.i0 + j];
    const surf = st.y;
    const kL = j * W, kR = j * W + (W - 1);

    const dL = surf - bed.getX(kL);
    const dR = surf - bed.getX(kR);
    /* The one place a rim in deep water is right: where the channel opens into
     * the basin, its surface has been clamped to the basin's level and there
     * is simply more water beyond the ribbon, which the pool mesh draws. That
     * is a continuation, not an edge. It is exempted by the two facts that
     * make it a continuation — the surface is at pool level and the ground
     * under the rim is inside the basin — rather than by a slack budget, so
     * the exemption cannot quietly absorb a genuine failure elsewhere. */
    const isDrowned = surf <= POOL_Y + 1e-3
      && poolBed(pos.getX(kL), pos.getZ(kL)) < POOL_Y
      && poolBed(pos.getX(kR), pos.getZ(kR)) < POOL_Y;
    if (isDrowned) { drowned.push(+st.t.toFixed(3)); continue; }
    edge.push({ j, t: st.t, dL, dR });

    /* March outward along the station's own lateral basis — the same tangent
     * the ribbon was laid with, so this cannot drift onto the wrong side the
     * way the minimap once did — until the carved ground rises through the
     * water surface. That crossing is the waterline, and it is a property of
     * the terrain, not of any width anyone authored. */
    const waterline = (sign) => {
      const step = 0.10, LIMIT = 8.0;
      for (let d = 0.2; d <= LIMIT; d += step) {
        const x = st.cx + st.tz * sign * d;
        const z = st.cz - st.tx * sign * d;
        if (T.height(x, z) >= surf) return d;
      }
      return LIMIT;
    };
    /* Per bank, because the ribbon is not symmetric: a meander cuts one side
     * and deposits on the other, so comparing a mean width against a mean
     * waterline would let a rim that ends in deep water be cancelled out by
     * the opposite rim overshooting onto dry ground. */
    const reach = (k, sign) => {
      const dx = pos.getX(k) - st.cx, dz = pos.getZ(k) - st.cz;
      return Math.hypot(dx, dz) * Math.sign(sign);
    };
    const pairs = [[Math.abs(reach(kR, 1)), waterline(+1)],
                   [Math.abs(reach(kL, -1)), waterline(-1)]];
    for (const [m, w] of pairs) cover.push({ j, t: st.t, meshHalf: m, wl: w, frac: m / Math.max(1e-6, w) });

    if (j % Math.max(1, Math.floor(rows / 8)) === 0) {
      samples.push({ t: +st.t.toFixed(3),
                     mesh: `${pairs[1][0].toFixed(2)}|${pairs[0][0].toFixed(2)}`,
                     waterline: `${pairs[1][1].toFixed(2)}|${pairs[0][1].toFixed(2)}`,
                     edgeDepth: `${dL.toFixed(2)}|${dR.toFixed(2)}` });
    }
  }

  const deepEdge = edge.filter((e) => Math.max(e.dL, e.dR) > EDGE_TOL);
  const thin = cover.filter((c) => c.frac < COVER_MIN);
  const worstEdge = edge.reduce((a, e) => Math.max(a, e.dL, e.dR), 0);
  const worstCover = cover.reduce((a, c) => Math.min(a, c.frac), 1);

  return {
    rows, across: W, banks: cover.length, tested: edge.length, drowned,
    deepEdge: deepEdge.length, thin: thin.length,
    worstEdge, worstCover,
    medianEdge: edge.map((e) => Math.max(e.dL, e.dR)).sort((a, b) => a - b)[edge.length >> 1],
    medianCover: cover.map((c) => c.frac).sort((a, b) => a - b)[cover.length >> 1],
    deepAt: deepEdge.map((e) => +e.t.toFixed(3)),
    samples,
  };
}, { EDGE_TOL, COVER_MIN });

await browser.close();

if (result.fatal) {
  console.error(`brook-edge: ${result.fatal}`);
  process.exit(1);
}

const n = result.tested;
const budget = Math.ceil(n * FAIL_BUDGET);
console.log(`brook-edge: ${result.rows} stations, ${result.across} vertices across; ` +
            `${result.drowned.length} drowned by the basin, ${n} tested`);
console.table(result.samples);
console.log(`  edge depth   median ${result.medianEdge.toFixed(3)} m  worst ${result.worstEdge.toFixed(3)} m` +
            `  over ${EDGE_TOL} m: ${result.deepEdge}/${n} (budget ${budget})`);
console.log(`  coverage     median ${(result.medianCover * 100).toFixed(1)}%  worst ${(result.worstCover * 100).toFixed(1)}%` +
            `  under ${COVER_MIN * 100}%: ${result.thin}/${result.banks} (budget ${2 * budget})`);

if (result.deepAt.length) console.log(`  deep rims at t: ${result.deepAt.join(' ')}`);

const fails = [];
if (result.deepEdge > budget) {
  fails.push(`${result.deepEdge} stations end the water surface in ${result.worstEdge.toFixed(2)} m of ` +
             `standing water — that rim is a hard polygonal edge at full opacity`);
}
if (result.thin > 2 * budget) {
  fails.push(`${result.thin} stations leave carved channel dry: the ribbon covers only ` +
             `${(result.worstCover * 100).toFixed(0)}% of the wetted width at worst`);
}
if (errors.length) fails.push(`page errors: ${errors.join('; ')}`);

if (fails.length) {
  for (const f of fails) console.error(`FAIL  ${f}`);
  process.exit(1);
}
console.log('brook-edge: PASS');
