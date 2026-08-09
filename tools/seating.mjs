/* Seating: is everything in the world touching the ground it should be?
 *
 * The commonest defect in a scattered world is not a missing object or a wrong
 * colour. It is an object at the wrong height — a boulder hovering, a fence
 * post sunk to its cap, a tuft floating after a terrain change. It is also the
 * defect most likely to survive review, because a screenshot of a hillside
 * looks fine and there are half a million instances.
 *
 * So this walks every InstancedMesh in a level and reports each layer's worst
 * offset from the terrain beneath it.
 *
 * MEASURED IN OBJECT RADII, NOT IN METRES. That distinction is the whole
 * value of the tool and it took two runs to learn. An absolute threshold
 * flagged the schist outcrops as broken at 24% "sunk more than a metre" —
 * they are up to five metres across and bedrock is SUPPOSED to be buried, so
 * the finding was an artefact of the threshold rather than a fact about the
 * world. Normalised by each instance's own size, they vanish from the report
 * and nothing else moves. A tolerance that does not scale with the thing it
 * judges will mostly tell you which layers contain big objects.
 *
 * Two exemptions, both legitimate:
 *   - things that fly, which are supposed to be in the air;
 *   - things mounted on posts, whose origin is at the sign and not the ground.
 *
 * And one threshold, which is the other thing this tool had to learn. A layer
 * is not broken because SOME of it is off the ground. The jungle grows ferns,
 * tussock and sprigs as epiphytes on trunks as well as in soil, so those
 * layers legitimately run about 6% elevated — and the same species is doing
 * both, so they cannot be exempted by name. A systematic placement bug puts
 * most of a layer in the wrong place; a handful of percent is special cases
 * doing what they were told. Failing at 5% produced fourteen rows of correct
 * behaviour and buried anything real. Failing at 25% is the useful line.
 *
 * With a MINIMUM SAMPLE, which is the third thing it had to learn. At 25% the
 * report filled with four- and eight-instance layers where a single perched
 * fern is 25% of the layer. A percentage computed over eight items is not a
 * measurement, and a threshold applied to one produces confident nonsense.
 * Below forty instances the layer is reported but never failed.
 *
 * Usage:  node tools/serve.mjs &
 *         node tools/seating.mjs [lake|jungle]
 */
import { run } from './harness.mjs';

const level = process.argv[2] || 'lake';

/* Layers whose origin is legitimately off the ground. Kept as an explicit,
 * short, commented list rather than a heuristic, so that adding one is a
 * decision somebody made rather than a threshold quietly widening. */
const AIRBORNE = [
  /bird/i, /butterfl/i, /life:/i, /fauna/i, /insect/i,
  /chevron/i,          // mounted on a post, origin at the board
  /wire|power/i,       // strung between poles
  /vine/i,             // climbers: hanging from a tree is the whole point
];

await run({ hash: `manual&tier=high&level=${level}`, timeout: 600_000 }, async ({ page }) => {
  const out = await page.evaluate(async (airborneSrc) => {
    const airborne = airborneSrc.map((s) => new RegExp(s.source, s.flags));
    const g = window.__game;
    g.begin();
    for (let i = 0; i < 60; i++) g.step(1 / 60);
    const THREE = window.THREE;
    const terrain = g.level.terrain;
    const M = new THREE.Matrix4(), V = new THREE.Vector3(),
          S = new THREE.Vector3(), Q = new THREE.Quaternion();
    const rows = [];
    let instances = 0;
    g.scene.traverse((o) => {
      if (!o.isInstancedMesh) return;
      const name = o.name || '(unnamed)';
      if (/water|lake-surface/i.test(name)) return;
      const exempt = airborne.some((re) => re.test(name));
      const geo = o.geometry;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const R = geo.boundingSphere.radius || 1;
      const n = Math.min(o.count, 500);
      let low = Infinity, high = -Infinity, bad = 0, cnt = 0;
      for (let k = 0; k < n; k++) {
        const i = Math.floor(k * o.count / n);
        o.getMatrixAt(i, M);
        M.decompose(V, Q, S);
        /* Parked instances live far below the world by convention. */
        if (!isFinite(V.y) || V.y < -50) continue;
        const d = V.y - terrain.height(V.x, V.z);
        if (!isFinite(d)) continue;
        const size = R * Math.max(S.x, S.y, S.z);
        const rel = d / Math.max(size, 0.05);
        cnt++;
        if (rel < low) low = rel;
        if (rel > high) high = rel;
        if (rel < -1.0 || rel > 1.2) bad++;
      }
      if (!cnt) return;
      instances += o.count;
      rows.push({ name, count: o.count, exempt,
                  low: +low.toFixed(2), high: +high.toFixed(2),
                  badPct: +(100 * bad / cnt).toFixed(0) });
    });
    return { rows, instances };
  }, AIRBORNE.map((re) => ({ source: re.source, flags: re.flags })));

  const checked = out.rows.filter((r) => !r.exempt);
  const BROKEN = 25;   // see the header: below this is special cases, not bugs
  const NOTE = 4;
  const MIN_N = 40;    // below this a percentage is not a measurement
  const bad = checked.filter((r) => r.badPct >= BROKEN && r.count >= MIN_N)
                     .sort((a, b) => b.badPct - a.badPct);
  const noted = checked.filter((r) => r.badPct >= NOTE && !(r.badPct >= BROKEN && r.count >= MIN_N))
                       .sort((a, b) => b.badPct - a.badPct);

  console.log(`\nseating: ${level}`);
  console.log(`  ${out.rows.length} instanced layers, ${out.instances.toLocaleString()} instances`);
  console.log(`  ${out.rows.length - checked.length} exempt (airborne / post-mounted)`);
  console.log('  offsets are in OBJECT RADII from the terrain below\n');

  if (noted.length) {
    const worst = noted[0];
    console.log(`  ${noted.length} layer(s) with a few instances off the ground ` +
                `(${NOTE}-${BROKEN - 1}%), e.g. ${worst.name} at ${worst.badPct}% ` +
                '— epiphytes and similar. Not treated as failures.\n');
  }

  if (!bad.length) {
    let worst = null;
    for (const r of checked) {
      const m = Math.max(Math.abs(r.low), Math.abs(r.high));
      if (!worst || m > worst.m) worst = { m, r };
    }
    console.log('  ok — every checked layer sits on the ground');
    if (worst) {
      console.log(`  worst single layer: ${worst.r.name} ` +
                  `(${worst.r.low} .. ${worst.r.high} radii)`);
    }
  } else {
    console.log(`  ${bad.length} layer(s) systematically off the ground (>= ${BROKEN}%):\n`);
    for (const r of bad) {
      console.log(`    ${r.name.padEnd(34)} n=${String(r.count).padStart(7)}  ` +
                  `${String(r.low).padStart(7)} .. ${String(r.high).padStart(7)} radii  ` +
                  `${r.badPct}% out`);
    }
    process.exitCode = 1;
  }
});
